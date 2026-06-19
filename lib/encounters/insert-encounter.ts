import type { SupabaseClient } from '@supabase/supabase-js'

export type EncounterInsertRow = {
  appointment_id: number
  patient_id?: number | null
  doctor_id?: number | null
  intake_id?: number | null
  pharmacy_id?: number | null
  status: string
  [key: string]: unknown
}

/** Resolve patient_id from appointment when not supplied on the payload. */
export async function resolveEncounterPatientId(
  admin: SupabaseClient,
  appointmentId: number,
  patientId?: number | null
): Promise<number> {
  if (patientId != null && Number.isFinite(Number(patientId))) {
    return Number(patientId)
  }

  const { data, error } = await admin
    .from('appointments')
    .select('patient_id')
    .eq('id', appointmentId)
    .maybeSingle()

  if (error) throw error

  const resolved = Number(data?.patient_id)
  if (!Number.isFinite(resolved)) {
    throw new Error('Appointment has no linked patient')
  }

  return resolved
}

/** Build an encounter insert row with a guaranteed patient_id (server-side). */
export async function buildEncounterInsertRow(
  admin: SupabaseClient,
  row: EncounterInsertRow
): Promise<EncounterInsertRow & { patient_id: number }> {
  const patient_id = await resolveEncounterPatientId(
    admin,
    row.appointment_id,
    row.patient_id
  )
  return { ...row, patient_id }
}

/** Insert encounter with patient_id resolved from appointment when omitted. */
export async function insertEncounter(
  admin: SupabaseClient,
  row: EncounterInsertRow
) {
  const payload = await buildEncounterInsertRow(admin, row)
  return admin.from('encounters').insert(payload).select('id').single()
}
