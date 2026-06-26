import type { SupabaseClient } from '@supabase/supabase-js'

type EncounterPatientRef = {
  patient_id?: number | string | null
  appointment_id?: number | null
}

/** Resolve patient id from encounter row, falling back to the linked appointment. */
export async function resolveEncounterPatientId(
  admin: SupabaseClient,
  encounter: EncounterPatientRef
): Promise<number | null> {
  const direct = encounter.patient_id
  if (direct != null && direct !== '') {
    const n = Number(direct)
    if (Number.isFinite(n) && n > 0) return n
  }

  if (encounter.appointment_id == null) return null

  const { data: appt } = await admin
    .from('appointments')
    .select('patient_id')
    .eq('id', encounter.appointment_id)
    .maybeSingle()

  const pid = appt?.patient_id
  if (pid == null || pid === '') return null
  const n = Number(pid)
  return Number.isFinite(n) && n > 0 ? n : null
}
