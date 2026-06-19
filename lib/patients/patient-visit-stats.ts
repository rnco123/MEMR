import type { SupabaseClient } from '@supabase/supabase-js'

export type PatientVisitStats = {
  encounterCounts: Record<number, number>
  encounterLastVisits: Record<number, string>
  appointmentLastVisits: Record<number, string>
}

function resolveEncounterPatientId(
  encounter: { patient_id: number | null; appointment_id: number | null },
  appointmentIdToPatientId: Map<number, number>
): number | null {
  if (encounter.patient_id != null) return Number(encounter.patient_id)
  if (encounter.appointment_id == null) return null
  return appointmentIdToPatientId.get(Number(encounter.appointment_id)) ?? null
}

/**
 * Visit counts for patients-history. Encounters are often linked only via
 * appointment_id (patient_id may be null), so resolve through appointments.
 */
export async function loadPatientVisitStats(
  admin: SupabaseClient,
  patientIds: number[]
): Promise<PatientVisitStats> {
  const encounterCounts: Record<number, number> = {}
  const encounterLastVisits: Record<number, string> = {}
  const appointmentLastVisits: Record<number, string> = {}

  if (patientIds.length === 0) {
    return { encounterCounts, encounterLastVisits, appointmentLastVisits }
  }

  const { data: appointments, error: appointmentsError } = await admin
    .from('appointments')
    .select('id, patient_id, appointment_date, appointment_time')
    .in('patient_id', patientIds)

  if (appointmentsError) throw appointmentsError

  const appointmentIdToPatientId = new Map<number, number>()
  for (const appointment of appointments ?? []) {
    const patientId = Number(appointment.patient_id)
    if (!Number.isFinite(patientId)) continue
    appointmentIdToPatientId.set(Number(appointment.id), patientId)

    if (!appointment.appointment_date) continue
    const dateTimeString = appointment.appointment_time
      ? `${appointment.appointment_date}T${appointment.appointment_time}`
      : appointment.appointment_date
    const existing = appointmentLastVisits[patientId]
    if (!existing || new Date(dateTimeString).getTime() > new Date(existing).getTime()) {
      appointmentLastVisits[patientId] = dateTimeString
    }
  }

  const appointmentIds = [...appointmentIdToPatientId.keys()]
  const seenEncounterIds = new Set<number>()
  const encounters: Array<{
    id: number
    patient_id: number | null
    appointment_id: number | null
    created_at: string | null
  }> = []

  const addEncounters = (
    rows: Array<{
      id: number
      patient_id: number | null
      appointment_id: number | null
      created_at: string | null
    }> | null
  ) => {
    for (const row of rows ?? []) {
      if (seenEncounterIds.has(row.id)) continue
      seenEncounterIds.add(row.id)
      encounters.push(row)
    }
  }

  const encounterSelect = 'id, patient_id, appointment_id, created_at'

  if (appointmentIds.length > 0) {
    const { data, error } = await admin
      .from('encounters')
      .select(encounterSelect)
      .in('appointment_id', appointmentIds)
    if (error) throw error
    addEncounters(data)
  }

  const { data: encountersByPatient, error: encountersByPatientError } = await admin
    .from('encounters')
    .select(encounterSelect)
    .in('patient_id', patientIds)

  if (encountersByPatientError) throw encountersByPatientError
  addEncounters(encountersByPatient)

  for (const encounter of encounters) {
    const patientId = resolveEncounterPatientId(encounter, appointmentIdToPatientId)
    if (patientId == null || !encounter.created_at) continue

    encounterCounts[patientId] = (encounterCounts[patientId] || 0) + 1
    if (
      !encounterLastVisits[patientId] ||
      encounter.created_at > encounterLastVisits[patientId]
    ) {
      encounterLastVisits[patientId] = encounter.created_at
    }
  }

  return { encounterCounts, encounterLastVisits, appointmentLastVisits }
}

export function resolvePatientLastVisit(
  patientId: number,
  encounterLastVisits: Record<number, string>,
  appointmentLastVisits: Record<number, string>
): string | null {
  const encounterDate = encounterLastVisits[patientId] || null
  const appointmentDate = appointmentLastVisits[patientId] || null

  if (encounterDate && appointmentDate) {
    return new Date(encounterDate).getTime() >= new Date(appointmentDate).getTime()
      ? encounterDate
      : appointmentDate
  }

  return encounterDate || appointmentDate
}
