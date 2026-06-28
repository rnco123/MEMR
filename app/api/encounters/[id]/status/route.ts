import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { assertEncounterAccess } from '@/lib/encounters/assert-access'
import { getProfileId, insertStatusTimeline, type StatusTimelineStatus } from '@/lib/status-timeline'
import { CLINICAL_STAFF_WITH_ADMIN_ROLE_SET } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = new Set<StatusTimelineStatus>([
  'appointment_initiated',
  'provider_assigned',
  'vitals_assessed',
  'in_consultation',
  'consultation_concluded',
  'final_review',
  'completed',
])

const statusBodySchema = z.object({
  status: z.string().min(1),
})

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!roleInfo?.role || !CLINICAL_STAFF_WITH_ADMIN_ROLE_SET.has(roleInfo.role)) {
      throw new AuthorizationError()
    }

    const admin = createAdminClient()
    await assertEncounterAccess(admin, user.id, encounterId)

    const { data, error } = await admin
      .from('encounters')
      .select('id, status')
      .eq('id', encounterId)
      .maybeSingle()

    if (error) throw error
    if (!data) throw new ValidationError('Encounter not found')

    return NextResponse.json({ data: { id: data.id, status: data.status ?? null } })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!roleInfo?.role || !CLINICAL_STAFF_WITH_ADMIN_ROLE_SET.has(roleInfo.role)) {
      throw new AuthorizationError()
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = statusBodySchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const nextStatus = parsed.data.status as StatusTimelineStatus
    if (!ALLOWED_STATUSES.has(nextStatus)) {
      throw new ValidationError('Invalid encounter status')
    }

    const admin = createAdminClient()
    await assertEncounterAccess(admin, user.id, encounterId)

    const { data, error } = await admin
      .from('encounters')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', encounterId)
      .select('id, status')
      .single()

    if (error) throw error

    const profileId = await getProfileId(supabase, user.id)
    if (profileId) {
      await insertStatusTimeline(admin, {
        encounterId,
        status: nextStatus,
        profileId,
      })
    }

    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}
