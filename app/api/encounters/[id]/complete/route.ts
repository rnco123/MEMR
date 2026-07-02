import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { isPhysicianRole } from '@/lib/roles'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { assertEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/assert-access'
import { completeEncounter } from '@/lib/encounter/complete-encounter'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

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
      throw new AuthorizationError('Only physicians can complete encounters')
    }

    const admin = createAdminClient()
    await assertEncounterAccess(admin, user.id, encounterId, ENCOUNTER_WRITE_ACCESS)
    const result = await completeEncounter(admin, { encounterId, userId: user.id })

    auditPhi({
      user,
      role: roleInfo?.role,
      action: 'encounter_updated',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'complete' },
      request,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    return handleApiError(e)
  }
}
