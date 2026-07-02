import { NextRequest, NextResponse } from 'next/server'
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
import { resolveEncounterWriteAllowed, isEncounterCompleted } from '@/lib/encounters/access-helpers'
import { loadEncounterDetail } from '@/lib/encounters/load-encounter-detail'
import { CLINICAL_STAFF_WITH_ADMIN_ROLE_SET, canEditClinicalEncounterContent, mapRoleToEnum } from '@/lib/roles'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
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
    // Viewing the encounter modal — location scope is enough; don't require the viewer
    // to be the literally-assigned doctor (that stricter check belongs on write actions).
    await assertEncounterAccess(admin, user.id, encounterId, { requireDoctorAssignment: false })

    const includePharmacyRegistry = request.nextUrl.searchParams.get('pharmacy_registry') === '1'
    const includePrescriptions = request.nextUrl.searchParams.get('prescriptions') === '1'
    const includePreSales = request.nextUrl.searchParams.get('pre_sales') === '1'

    const data = await loadEncounterDetail(admin, encounterId, {
      includePharmacyRegistry,
      includePrescriptions,
      includePreSales,
    })

    auditPhi({
      user,
      role: roleInfo.role,
      action: 'encounter_viewed',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'detail', patient_id: data.encounter.patient_id ?? null },
      request,
    })

    const mappedRole = mapRoleToEnum(roleInfo.role)
    const can_edit_workflow =
      mappedRole != null
        ? await resolveEncounterWriteAllowed(admin, user.id, mappedRole, {
            doctor_id: data.encounter.doctor_id as number | null | undefined,
          })
        : false
    const encounterCompleted = isEncounterCompleted(data.encounter.status as string | null | undefined)
    const can_edit_intake =
      mappedRole != null && canEditClinicalEncounterContent(mappedRole) && !encounterCompleted
    const can_edit_vitals = can_edit_intake

    return NextResponse.json({
      ...data,
      permissions: { can_edit_workflow, can_edit_intake, can_edit_vitals },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
