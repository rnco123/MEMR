import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { canEditClinicalEncounterContent } from '@/lib/roles'
import { guardEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/guard'
import { auditPhi } from '@/lib/audit-phi'
import {
  assertDiagnosisEncounterEditable,
  parseDiagnosisId,
} from '@/lib/diagnoses/validation'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; diagnosisId: string } }
) {
  try {
    const encounterId = parseDiagnosisId(params.id, 'encounter id')
    const encounterDiagnosisId = parseDiagnosisId(params.diagnosisId, 'diagnosis id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!canEditClinicalEncounterContent(roleInfo?.role)) {
      throw new AuthorizationError('Clinical staff only')
    }

    const admin = await guardEncounterAccess(user.id, encounterId, ENCOUNTER_WRITE_ACCESS)
    const { data: encounter, error: encounterError } = await admin
      .from('encounters')
      .select('id, status')
      .eq('id', encounterId)
      .maybeSingle()
    if (encounterError) throw encounterError
    if (!encounter) throw new NotFoundError('Encounter not found')
    assertDiagnosisEncounterEditable(encounter.status)

    const { data: row, error: rowError } = await admin
      .from('encounter_diagnoses')
      .select('id, diagnosis_id')
      .eq('id', encounterDiagnosisId)
      .eq('encounter_id', encounterId)
      .maybeSingle()
    if (rowError) throw rowError
    if (!row) throw new NotFoundError('Encounter diagnosis not found')

    const { error } = await admin
      .from('encounter_diagnoses')
      .delete()
      .eq('id', encounterDiagnosisId)
      .eq('encounter_id', encounterId)
    if (error) throw error

    auditPhi({
      user,
      role: roleInfo?.role,
      action: 'encounter_updated',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: {
        section: 'diagnoses',
        operation: 'delete',
        encounter_diagnosis_id: encounterDiagnosisId,
        diagnosis_id: Number(row.diagnosis_id),
      },
      request,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
