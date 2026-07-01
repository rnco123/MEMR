import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFoundError, ValidationError } from '@/lib/api-error-handler'
import { encounterSectionAuditFromRow } from '@/lib/encounter/encounter-section-audit'
import { INTAKE_FORM_DETAIL_SELECT } from '@/lib/encounters/encounter-detail-selects'
import { loadIntakeForEncounter } from '@/lib/encounters/load-intake-for-encounter'
import { buildIntakeFormRow } from '@/lib/nurse/walk-in-intake'
import type { NurseWalkInIntakeInput } from '@/lib/validation'

export type SaveEncounterIntakeEditor = {
  userId: string
  role: string
  editorName: string
}

export async function saveEncounterIntake(
  admin: SupabaseClient,
  encounterId: number,
  intake: NurseWalkInIntakeInput,
  editor: SaveEncounterIntakeEditor
): Promise<Record<string, unknown>> {
  const { data: encounter, error: encError } = await admin
    .from('encounters')
    .select('id, appointment_id, intake_id, status')
    .eq('id', encounterId)
    .maybeSingle()

  if (encError) throw encError
  if (!encounter) throw new NotFoundError('Encounter not found')
  if (encounter.status === 'completed') {
    throw new ValidationError('Intake form cannot be changed after the encounter is completed')
  }

  const appointmentId =
    encounter.appointment_id != null && Number.isFinite(Number(encounter.appointment_id))
      ? Number(encounter.appointment_id)
      : null
  if (appointmentId == null) {
    throw new ValidationError('Encounter has no appointment; cannot save intake form')
  }

  const intakeId =
    encounter.intake_id != null && Number.isFinite(Number(encounter.intake_id))
      ? Number(encounter.intake_id)
      : null

  const intakeRow = buildIntakeFormRow(intake) ?? {}
  const now = new Date().toISOString()
  const auditFields = {
    edited_by: editor.userId,
    editor_role: editor.role,
    editor_name: editor.editorName,
    updated_at: now,
  }

  const existing = await loadIntakeForEncounter(admin, intakeId, appointmentId)

  if (existing?.id) {
    const { data, error } = await admin
      .from('intake_form')
      .update({ ...intakeRow, ...auditFields })
      .eq('id', Number(existing.id))
      .select(INTAKE_FORM_DETAIL_SELECT)
      .single()
    if (error) throw error
    return data as Record<string, unknown>
  }

  const { data: inserted, error: insertError } = await admin
    .from('intake_form')
    .insert({ appointment_id: appointmentId, ...intakeRow, ...auditFields })
    .select(INTAKE_FORM_DETAIL_SELECT)
    .single()

  if (insertError) throw insertError

  const newIntakeId = Number((inserted as { id: number }).id)
  const { error: linkError } = await admin
    .from('encounters')
    .update({ intake_id: newIntakeId, updated_at: now })
    .eq('id', encounterId)

  if (linkError) throw linkError

  return inserted as Record<string, unknown>
}

export function intakeLastAuditFromRow(row: Record<string, unknown> | null) {
  return encounterSectionAuditFromRow(row)
}
