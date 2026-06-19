import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSupabaseWithAccessToken, hasServiceRoleKey } from '@/lib/supabase/user-jwt-client'
import { config } from '@/lib/config'
import { fetchProfileFields, fetchUserRole } from '@/lib/fetch-user-role'
import { UserRole, mapRoleToEnum, isPhysicianRole } from '@/lib/roles'
import { getLocationScopeForUser, resolveClinicalApiRole } from '@/lib/locations/scope'

export const dynamic = 'force-dynamic'

/** Auth user + access token for user-scoped DB reads (matches browser; works without service role). */
async function getAuthFromRequest(request: Request): Promise<{ user: User; accessToken: string | null } | null> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (token) {
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (!error && user) return { user, accessToken: token }
  }

  // M-04d: Use getUser() for verified server-side auth.
  const supabaseServer = await import('@/lib/supabase/server').then((m) => m.createClient())
  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser()
  if (userErr || !user) return null
  return { user, accessToken: null }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const doctorUserId = searchParams.get('doctor_id') // This is user_id (UUID)

  const authResult = await getAuthFromRequest(request)
  const user = authResult?.user ?? null
  const accessToken = authResult?.accessToken ?? null

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let supabase
  if (hasServiceRoleKey()) {
    supabase = createAdminClient()
  } else if (accessToken) {
    supabase = createSupabaseWithAccessToken(accessToken)
  } else {
    return NextResponse.json(
      {
        error:
          'Server misconfiguration: set SUPABASE_SERVICE_ROLE_KEY or call with a valid session / Authorization bearer token.',
      },
      { status: 500 }
    )
  }

  // L-03: Resolve role — nurses/staff can only query their own availability or within shared location.
  const isValidUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

  const roleInfo = await fetchUserRole(supabase, user.id)
  const clinicalRole = resolveClinicalApiRole(roleInfo?.role)
  if (!clinicalRole) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const scope = await getLocationScopeForUser(supabase, user.id, clinicalRole)

  const doctorUserIdParam = doctorUserId && isValidUuid(doctorUserId) ? doctorUserId : null
  const userIdToLookup = doctorUserIdParam ?? user.id

  if (userIdToLookup !== user.id) {
    if (isPhysicianRole(clinicalRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (clinicalRole === UserRole.NURSE) {
      const { data: targetDoctor } = await supabase
        .from('doctors')
        .select('id, location_id')
        .eq('user_id', userIdToLookup)
        .maybeSingle()

      if (!targetDoctor) {
        return NextResponse.json({
          data: { doctor_id: null, is_available: false, updated_at: null },
        })
      }

      const loc = targetDoctor.location_id as number | null
      if (
        !scope.unrestricted &&
        loc != null &&
        !scope.locationIds.includes(loc)
      ) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  }

  if (userIdToLookup) {
    // First, get the doctor record by user_id
    const { data: doctorData, error: doctorError } = await supabase
      .from('doctors')
      .select('id')
      .eq('user_id', userIdToLookup)
      .single()

    if (doctorError || !doctorData) {
      return NextResponse.json({ 
        data: { doctor_id: null, is_available: false, updated_at: null } 
      })
    }

    // Get specific doctor's availability
    const { data, error } = await supabase
      .from('doctor_availability')
      .select('*')
      .eq('doctor_id', doctorData.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ 
          data: { doctor_id: doctorData.id, is_available: false, updated_at: null } 
        })
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  }

  // Get available doctors scoped to caller's locations (for nurse virtual waiting room)
  const { data, error } = await supabase
    .from('doctor_availability')
    .select('doctor_id, is_available, updated_at, doctors(location_id)')
    .eq('is_available', true)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  const filtered = (data ?? []).filter((row) => {
    if (scope.unrestricted) return true
    const doc = Array.isArray(row.doctors) ? row.doctors[0] : row.doctors
    const loc = (doc as { location_id?: number | null } | null)?.location_id
    return loc != null && scope.locationIds.includes(loc)
  })

  const sanitized = filtered.map(({ doctors: _d, ...rest }) => rest)

  return NextResponse.json({ data: sanitized })
}

export async function POST(request: Request) {
  const authResult = await getAuthFromRequest(request)
  const user = authResult?.user ?? null
  const accessToken = authResult?.accessToken ?? null

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse request body safely
  let body: { is_available?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const is_available = body?.is_available === true || body?.is_available === false
    ? body.is_available
    : undefined

  if (is_available === undefined) {
    return NextResponse.json(
      { error: 'is_available is required (true or false)' },
      { status: 400 }
    )
  }

  // Prefer user JWT for reads/writes so local dev works without SUPABASE_SERVICE_ROLE_KEY (RLS matches browser)
  const readSb =
    accessToken != null ? createSupabaseWithAccessToken(accessToken) : hasServiceRoleKey() ? createAdminClient() : null
  if (!readSb) {
    return NextResponse.json(
      {
        error:
          'Server misconfiguration: set SUPABASE_SERVICE_ROLE_KEY (or sign in with a session that provides an access token).',
      },
      { status: 500 }
    )
  }

  // Only doctors can update — JWT metadata role, DB profile (id/uid/email/user_profiles), then doctors row
  const profile = await fetchProfileFields(readSb, user.id, 'role, full_name, email', {
    email: user.email,
  })

  const { data: existingDoctorCheck } = await readSb
    .from('doctors')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const profileRole = mapRoleToEnum(
    profile?.role != null ? String(profile.role) : undefined
  )
  const isDoctor = isPhysicianRole(profileRole) || !!existingDoctorCheck

  if (!isDoctor) {
    return NextResponse.json(
      { error: 'Only doctors can update availability status' },
      { status: 403 }
    )
  }

  const doctorEmail = (profile?.email as string | undefined) || user.email || ''
  const doctorName = (profile?.full_name as string | undefined) || user.email || 'Doctor'

  const writeSb =
    accessToken != null && !hasServiceRoleKey() ? createSupabaseWithAccessToken(accessToken) : createAdminClient()

  // First, ensure the doctor exists in the doctors table
  const { data: existingDoctor } = await writeSb
    .from('doctors')
    .select('id, user_id, email, full_name')
    .eq('user_id', user.id)
    .single()

  let doctorId: number

  // If doctor doesn't exist, create it
  if (!existingDoctor) {
    const { data: newDoctor, error: createDoctorError } = await writeSb
      .from('doctors')
      .insert({
        user_id: user.id,
        full_name: doctorName,
        email: doctorEmail,
      })
      .select('id')
      .single()

    if (createDoctorError || !newDoctor) {
      return NextResponse.json(
        { error: 'Failed to create doctor record. Please ensure your profile is set up.' },
        { status: 400 }
      )
    }

    doctorId = newDoctor.id
  } else {
    doctorId = existingDoctor.id
  }

  // Upsert availability (doctor_availability has UNIQUE(doctor_id))
  const { error: upsertError } = await writeSb
    .from('doctor_availability')
    .upsert(
      {
        doctor_id: doctorId,
        is_available,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'doctor_id',
        ignoreDuplicates: false,
      }
    )

  if (upsertError) {
    return NextResponse.json(
      { error: upsertError.message || 'Failed to update availability' },
      { status: 500 }
    )
  }

  return NextResponse.json({ 
    success: true, 
    data: { doctor_id: doctorId, is_available } 
  })
}
