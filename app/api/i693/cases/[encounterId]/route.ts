import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchProfileFields, fetchUserRole } from '@/lib/fetch-user-role'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from '@/lib/api-error-handler'
import { syncImmigrationCase } from '@/lib/immigration/case-sync'
import type { ImmigrationWorkflowStatus } from '@/lib/immigration/types'
import { isI693ApiRole } from '@/lib/immigration/api-auth'
import { logI693Audit } from '@/lib/i693/audit-log'
import { guardEncounterAccess } from '@/lib/encounters/guard'

export const dynamic = 'force-dynamic'
const STATUSES = new Set<ImmigrationWorkflowStatus>([
  'incomplete',
  'ready_review',
  'completed',
  'doctor_reviewed',
  'delivered',
])

export async function GET(
  _request: Request,
  { params }: { params: { encounterId: string } }
) {
  try {
    const encounterId = Number(params.encounterId)
    if (!Number.isFinite(encounterId)) throw new ValidationError('Invalid encounter id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isI693ApiRole(roleInfo?.role)) throw new AuthorizationError()

    await guardEncounterAccess(user.id, encounterId)

    const admin = createAdminClient()
    const caseRow = await syncImmigrationCase(admin, encounterId)
    if (!caseRow) throw new ValidationError('Not an immigration encounter')

    return NextResponse.json({ data: caseRow })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { encounterId: string } }
) {
  try {
    const encounterId = Number(params.encounterId)
    if (!Number.isFinite(encounterId)) throw new ValidationError('Invalid encounter id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isI693ApiRole(roleInfo?.role)) throw new AuthorizationError()
    const role = roleInfo!.role!.trim().toLowerCase()

    await guardEncounterAccess(user.id, encounterId)

    let body: {
      status?: string
      is_delivered?: boolean
      delivery_type?: string | null
      delivery_date?: string | null
      notes?: string | null
      resync?: boolean
    }
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const admin = createAdminClient()

    if (body.resync) {
      const caseRow = await syncImmigrationCase(admin, encounterId, { forceRecomputeStatus: true })
      if (!caseRow) throw new ValidationError('Not an immigration encounter')
      return NextResponse.json({ data: caseRow })
    }

    const manualStatus = body.status as ImmigrationWorkflowStatus | undefined
    if (manualStatus && !STATUSES.has(manualStatus)) {
      throw new ValidationError('Invalid workflow status')
    }

    const actorProfile = manualStatus
      ? await fetchProfileFields(supabase, user.id, 'full_name, email', { email: user.email })
      : null
    const actorName =
      (typeof actorProfile?.full_name === 'string' && actorProfile.full_name.trim()) ||
      (typeof actorProfile?.email === 'string' && actorProfile.email.trim()) ||
      user.email ||
      'Unknown user'

    const caseRow = await syncImmigrationCase(admin, encounterId, {
      manualStatus,
      statusUpdatedByUserId: manualStatus ? user.id : undefined,
      statusUpdatedByName: manualStatus ? actorName : undefined,
      is_delivered: body.is_delivered,
      delivery_type: body.delivery_type,
      delivery_date: body.delivery_date,
      notes: body.notes,
    })

    if (!caseRow) throw new ValidationError('Not an immigration encounter')

    await logI693Audit('workflow_updated', encounterId, {
      status: manualStatus ?? caseRow.status,
      role,
      source: role === 'admin' ? 'admin' : 'clinical',
    })

    return NextResponse.json({ data: caseRow })
  } catch (e) {
    return handleApiError(e)
  }
}
