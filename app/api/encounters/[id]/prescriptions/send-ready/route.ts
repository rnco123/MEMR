import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { guardEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/guard'
import { isPhysicianRole } from '@/lib/roles'
import { releaseEncounterPrescriptionsToAdmin } from '@/lib/prescriptions/prescription-ready'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

/** Physician releases all encounter prescriptions to the admin queue (locks edits). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = parseEncounterId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isPhysicianRole(roleInfo?.role)) {
      throw new ValidationError('Only physicians can send prescriptions to the pharmacy')
    }

    await guardEncounterAccess(user.id, encounterId, ENCOUNTER_WRITE_ACCESS)

    const admin = createAdminClient()
    const rows = await releaseEncounterPrescriptionsToAdmin(admin, {
      encounterId,
      userId: user.id,
      userEmail: user.email,
      role: roleInfo!.role!,
    })

    auditPhi({
      user,
      role: roleInfo?.role,
      action: 'prescription_updated',
      resourceType: 'prescription',
      resourceId: encounterId,
      metadata: { scope: 'released_to_admin', count: rows.length },
      request,
    })

    return NextResponse.json({ success: true, data: rows, released: true })
  } catch (e) {
    return handleApiError(e)
  }
}
