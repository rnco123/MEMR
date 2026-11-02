import type { SupabaseClient } from '@supabase/supabase-js'
import { getDoctorIdForUser } from '@/lib/locations/flowboard-data'
import { getClinicTodayDateString } from '@/lib/datetime/clinic-timezone'
import {
  getLocationScopeForUser,
  isAllowedByLocationScope,
  resolveEffectiveLocationId,
} from '@/lib/locations/scope'

export type UpcomingAppointmentRow = {
  id: string
  appointment_date: string
  appointment_time: string | null
  onsite_type: string | null
  encounter_id: number | null
  status: string | null
  patient: { first_name: string; last_name: string } | null
}

/**
 * Upcoming visits for a provider: visits assigned to them, plus unassigned visits
 * (e.g. booked by a nurse) in their locations — the same visits the Appointments tab shows.
 */
export async function loadUpcomingAppointmentsForDoctor(
  admin: SupabaseClient,
  userId: string,
  role: string,
  limit = 5
): Promise<UpcomingAppointmentRow[]> {
  const doctorId = await getDoctorIdForUser(admin, userId)
  if (doctorId == null) return []

  const scope = await getLocationScopeForUser(admin, userId, role)

  const today = getClinicTodayDateString()

  const { data: appointmentsData, error: apptErr } = await admin
    .from('appointments')
    .select('id, appointment_date, appointment_time, onsite_type, patient_id, location_id')
    .gte('appointment_date', today)
    .order('appointment_date', { ascending: true })
    .order('appointment_time', { ascending: true })

  if (apptErr) throw apptErr
  if (!appointmentsData?.length) return []

  const appointmentIds = appointmentsData.map((a) => a.id)
  const patientIds = [...new Set(appointmentsData.map((a) => a.patient_id).filter(Boolean))]

  const [{ data: encounters, error: encErr }, { data: patientsData, error: patErr }] =
    await Promise.all([
      admin
        .from('encounters')
        .select('id, appointment_id, status, doctor_id')
        .in('appointment_id', appointmentIds),
      admin
        .from('patients')
        .select('id, first_name, last_name, location_id')
        .in('id', patientIds.length > 0 ? patientIds : [-1]),
    ])

  if (encErr) throw encErr
  if (patErr) throw patErr

  const rows: UpcomingAppointmentRow[] = []

  for (const appointment of appointmentsData) {
    const encounter = encounters?.find((e) => e.appointment_id === appointment.id)
    if (encounter?.status === 'completed') continue

    const patient = patientsData?.find((p) => p.id === appointment.patient_id)

    if (encounter?.doctor_id !== doctorId) {
      // Assigned to another provider.
      if (encounter?.doctor_id != null) continue
      const effectiveLocationId = resolveEffectiveLocationId(
        patient?.location_id,
        appointment.location_id
      )
      if (!isAllowedByLocationScope(scope, effectiveLocationId)) continue
    }

    rows.push({
      id: String(appointment.id),
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time ?? null,
      onsite_type: (appointment as { onsite_type?: string | null }).onsite_type ?? null,
      encounter_id: encounter?.id ?? null,
      status: encounter?.status ?? 'scheduled',
      patient: patient ? { first_name: patient.first_name, last_name: patient.last_name } : null,
    })

    if (rows.length >= limit) break
  }

  return rows
}
