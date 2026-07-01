import type { SupabaseClient } from '@supabase/supabase-js'
import { INTAKE_FORM_DETAIL_SELECT } from '@/lib/encounters/encounter-detail-selects'
import { intakeRowToFormInput } from '@/lib/intake/intake-form-mappers'
import type { NurseWalkInIntakeInput } from '@/lib/validation'

/** Latest intake_form for a patient (excluding a specific appointment), for smart prefill. */
export async function loadIntakePrefillForPatient(
  admin: SupabaseClient,
  patientId: number,
  excludeAppointmentId?: number | null
): Promise<NurseWalkInIntakeInput | null> {
  const { data: appointments, error: apptError } = await admin
    .from('appointments')
    .select('id')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (apptError) throw apptError
  const appointmentIds = (appointments ?? [])
    .map((a) => Number((a as { id: number }).id))
    .filter((id) => Number.isFinite(id) && id > 0)
    .filter((id) => excludeAppointmentId == null || id !== excludeAppointmentId)

  if (appointmentIds.length === 0) return null

  const { data: forms, error: formError } = await admin
    .from('intake_form')
    .select(INTAKE_FORM_DETAIL_SELECT)
    .in('appointment_id', appointmentIds)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (formError) throw formError
  const row = (forms?.[0] as Record<string, unknown> | undefined) ?? null
  if (!row) return null

  const input = intakeRowToFormInput(row)
  return Object.keys(input).length > 0 ? input : null
}
