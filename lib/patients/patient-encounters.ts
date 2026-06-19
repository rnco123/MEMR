import type { SupabaseClient } from '@supabase/supabase-js'

export const PATIENT_ENCOUNTER_SELECT = `*, appointments (*), doctors (*)`

/**
 * Load encounters for a patient. Many rows only set appointment_id (patient_id null).
 */
export async function loadEncountersForPatient<T = Record<string, unknown>>(
  admin: SupabaseClient,
  patientId: number,
  select: string = PATIENT_ENCOUNTER_SELECT
): Promise<T[]> {
  const { data: appointments, error: appointmentsError } = await admin
    .from('appointments')
    .select('id')
    .eq('patient_id', patientId)

  if (appointmentsError) throw appointmentsError

  const appointmentIds = (appointments ?? []).map((row) => Number(row.id)).filter(Number.isFinite)
  const seenIds = new Set<number>()
  const merged: T[] = []

  const addRows = (rows: T[] | null) => {
    for (const row of rows ?? []) {
      const id = Number((row as { id?: number }).id)
      if (!Number.isFinite(id) || seenIds.has(id)) continue
      seenIds.add(id)
      merged.push(row)
    }
  }

  if (appointmentIds.length > 0) {
    const { data, error } = await admin
      .from('encounters')
      .select(select)
      .in('appointment_id', appointmentIds)
      .order('created_at', { ascending: false })
    if (error) throw error
    addRows(data as T[] | null)
  }

  const { data: byPatientId, error: byPatientError } = await admin
    .from('encounters')
    .select(select)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (byPatientError) throw byPatientError
  addRows(byPatientId as T[] | null)

  merged.sort((a, b) => {
    const aTime = new Date((a as { created_at?: string | null }).created_at ?? 0).getTime()
    const bTime = new Date((b as { created_at?: string | null }).created_at ?? 0).getTime()
    return bTime - aTime
  })

  return merged
}
