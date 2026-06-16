import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { postVisitTaskCreateSchema } from '@/lib/validation'
import { handleApiError, AuthenticationError, ValidationError, AuthorizationError } from '@/lib/api-error-handler'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { getLocationScopeForUser, resolveClinicalApiRole } from '@/lib/locations/scope'
import { guardEncounterAccess, guardPatientAccess } from '@/lib/encounters/guard'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    const clinicalRole = resolveClinicalApiRole(roleInfo?.role)
    if (!clinicalRole) throw new AuthorizationError()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const admin = createAdminClient()
    const scope = await getLocationScopeForUser(admin, user.id, clinicalRole)

    let q = admin
      .from('post_visit_tasks')
      .select('*, patients(location_id)')
      .order('due_at', { ascending: true, nullsFirst: false })

    if (status && status !== 'all') {
      q = q.eq('status', status)
    }

    const { data, error } = await q
    if (error) throw error

    const filtered = (data ?? []).filter((row) => {
      if (scope.unrestricted) return true
      const patient = row.patients as { location_id?: number | null } | null
      const loc = patient?.location_id
      return loc != null && scope.locationIds.includes(loc)
    })

    return NextResponse.json({ data: filtered })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = postVisitTaskCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data
    if (v.encounter_id != null) {
      await guardEncounterAccess(user.id, v.encounter_id)
      const admin = createAdminClient()
      const { data: enc } = await admin
        .from('encounters')
        .select('patient_id')
        .eq('id', v.encounter_id)
        .maybeSingle()
      if (!enc) throw new ValidationError('Encounter not found')
      if (Number(enc.patient_id) !== v.patient_id) {
        throw new ValidationError('Patient does not match encounter')
      }
    } else {
      await guardPatientAccess(user.id, v.patient_id)
    }

    const { data, error } = await supabase
      .from('post_visit_tasks')
      .insert({
        encounter_id: v.encounter_id ?? null,
        patient_id: v.patient_id,
        task_type: v.task_type,
        title: v.title,
        due_at: v.due_at ?? null,
        notes: v.notes ?? null,
        status: 'open',
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}
