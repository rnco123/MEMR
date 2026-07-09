import { NextResponse } from 'next/server'
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
import { resolveEncounterPatientId } from '@/lib/encounters/resolve-patient-id'
import { CLINICAL_STAFF_WITH_ADMIN_ROLE_SET } from '@/lib/roles'
import { auditPhi } from '@/lib/audit-phi'
import { syncLatestPhysicalExaminationToPatientChart } from '@/lib/encounter/sync-physical-examination-document'

export const dynamic = 'force-dynamic'

const VIEWER_ROLES = CLINICAL_STAFF_WITH_ADMIN_ROLE_SET

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

/** Regenerate the global Physical Examination PDF on the patient chart (all clinical roles). */
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
    const role = roleInfo?.role
    if (!role || !VIEWER_ROLES.has(role)) {
      throw new AuthorizationError()
    }

    const admin = createAdminClient()
    await assertEncounterAccess(admin, user.id, encounterId)

    const { data: encounterRow, error: encErr } = await admin
      .from('encounters')
      .select('id, patient_id, appointment_id')
      .eq('id', encounterId)
      .maybeSingle()

    if (encErr) throw encErr
    if (!encounterRow) throw new ValidationError('Encounter not found')

    const patientId = await resolveEncounterPatientId(admin, encounterRow)
    if (patientId == null) {
      throw new ValidationError('Patient is not linked to this encounter')
    }

    const result = await syncLatestPhysicalExaminationToPatientChart(admin, patientId, user.id)

    if (result.action === 'skipped') {
      return NextResponse.json(
        {
          success: false,
          error: 'No physical examination data is available to sync for this patient.',
          action: result.action,
        },
        { status: 400 }
      )
    }

    auditPhi({
      user,
      role,
      action: 'document_uploaded',
      resourceType: 'patient',
      resourceId: patientId,
      metadata: {
        section: 'physical_examination_chart_sync',
        encounter_id: encounterId,
        action: result.action,
      },
      request,
    })

    return NextResponse.json({
      success: true,
      action: result.action,
      file_path: result.filePath,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
