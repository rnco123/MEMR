import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

async function getUserFromRequest(request: Request): Promise<{ user: { id: string; email?: string; user_metadata?: { full_name?: string } } } | null> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (token) {
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user) return { user }
  }

  const supabaseServer = await import('@/lib/supabase/server').then((m) => m.createClient())
  const { data: { session } } = await supabaseServer.auth.getSession()
  const user = session?.user ?? null
  return user ? { user } : null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const doctorUserId = searchParams.get('doctor_id') // This is user_id (UUID)

  const authResult = await getUserFromRequest(request)
  const user = authResult?.user ?? null

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use admin client for DB operations (bypasses RLS)
  let supabase
  try {
    supabase = createAdminClient()
  } catch (e) {
    throw e
  }

  // Use doctor_id param if provided (must be valid UUID), otherwise use current user for doctor's own dashboard
  const isValidUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  const userIdToLookup = doctorUserId && isValidUuid(doctorUserId) ? doctorUserId : user.id

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

  // Get all available doctors (for nurse flowboard)
  const { data, error } = await supabase
    .from('doctor_availability')
    .select('doctor_id, is_available, updated_at')
    .eq('is_available', true)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: data || [] })
}

export async function POST(request: Request) {
  const authResult = await getUserFromRequest(request)
  const user = authResult?.user ?? null

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

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

  // Only doctors can update their availability - check profile or doctors table (admin client for reads)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, email')
    .eq('uid', user.id)
    .single()

  // Allow if profile says doctor, OR if user already has a doctor record
  const { data: existingDoctorCheck } = await supabase
    .from('doctors')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const isDoctor = profile?.role === 'doctor' || !!existingDoctorCheck

  if (!isDoctor) {
    return NextResponse.json(
      { error: 'Only doctors can update availability status' },
      { status: 403 }
    )
  }

  const doctorEmail = profile?.email || user.email || ''
  const doctorName = profile?.full_name || user.email || 'Doctor'

  // First, ensure the doctor exists in the doctors table
  const { data: existingDoctor } = await supabase
    .from('doctors')
    .select('id, user_id, email, full_name')
    .eq('user_id', user.id)
    .single()

  let doctorId: number

  // If doctor doesn't exist, create it
  if (!existingDoctor) {
    const { data: newDoctor, error: createDoctorError } = await supabase
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
  const { error: upsertError } = await supabase
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
