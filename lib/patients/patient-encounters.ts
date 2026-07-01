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

type EncounterDoctorRow = {
  user_id?: string | null
  role?: string | null
  [key: string]: unknown
}

type EncounterWithDoctor = {
  doctors?: EncounterDoctorRow | EncounterDoctorRow[] | null
}

function normalizeDoctorRow(
  doctors: EncounterWithDoctor['doctors']
): EncounterDoctorRow | null {
  if (!doctors) return null
  return Array.isArray(doctors) ? (doctors[0] ?? null) : doctors
}

/** Attach profiles.role to each encounter's assigned provider for UI labels (Doctor / FNP / PA). */
export async function enrichEncountersWithProviderRoles(
  admin: SupabaseClient,
  encounters: EncounterWithDoctor[]
): Promise<void> {
  const userIds = [
    ...new Set(
      encounters
        .map((enc) => normalizeDoctorRow(enc.doctors)?.user_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ]
  if (userIds.length === 0) return

  const roleByUserId = new Map<string, string>()

  const { data: byUid, error: byUidError } = await admin
    .from('profiles')
    .select('uid, role')
    .in('uid', userIds)
  if (byUidError) throw byUidError
  for (const row of byUid ?? []) {
    const uid = row.uid as string | null
    const role = row.role as string | null
    if (uid && role) roleByUserId.set(uid, role)
  }

  const { data: byId, error: byIdError } = await admin
    .from('profiles')
    .select('id, role')
    .in('id', userIds)
  if (byIdError) throw byIdError
  for (const row of byId ?? []) {
    const id = row.id as string | null
    const role = row.role as string | null
    if (id && role && !roleByUserId.has(id)) roleByUserId.set(id, role)
  }

  for (const enc of encounters) {
    const doctor = normalizeDoctorRow(enc.doctors)
    if (!doctor?.user_id) continue
    doctor.role = roleByUserId.get(doctor.user_id) ?? null
  }
}
