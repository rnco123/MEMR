import type { SupabaseClient } from '@supabase/supabase-js'
import { getDoctorIdForUser } from '@/lib/locations/flowboard-data'

export type UpcomingAppointmentRow = {
  id: string
  appointment_date: string
  appointment_time: string | null
  onsite_type: string | null
  encounter_id: number | null
  status: string | null
  patient: { first_name: string; last_name: string } | null
}

export async function loadUpcomingAppointmentsForDoctor(
  admin: SupabaseClient,
  userId: string,
  limit = 5
): Promise<UpcomingAppointmentRow[]> {
  const doctorId = await getDoctorIdForUser(admin, userId)
  if (doctorId == null) return []

  const { data: encounters, error: encErr } = await admin
    .from('encounters')
    .select('id, appointment_id, status')
    .eq('doctor_id', doctorId)

  if (encErr) throw encErr
  if (!encounters?.length) return []

  const appointmentIds = encounters
    .map((e) => e.appointment_id)
    .filter((id): id is number => id != null && Number.isFinite(Number(id)))

  if (appointmentIds.length === 0) return []

  const today = new Date().toISOString().split('T')[0]

  const { data: appointmentsData, error: apptErr } = await admin
    .from('appointments')
    .select('id, appointment_date, appointment_time, onsite_type, patient_id')
    .in('id', appointmentIds)
    .gte('appointment_date', today)
    .order('appointment_date', { ascending: true })
    .limit(limit)

  if (apptErr) throw apptErr
  if (!appointmentsData?.length) return []

  const patientIds = [...new Set(appointmentsData.map((a) => a.patient_id).filter(Boolean))]
  const { data: patientsData, error: patErr } = await admin
    .from('patients')
    .select('id, first_name, last_name')
    .in('id', patientIds.length > 0 ? patientIds : [-1])

  if (patErr) throw patErr

  return appointmentsData.map((appointment) => ({
    id: String(appointment.id),
    appointment_date: appointment.appointment_date,
    appointment_time: appointment.appointment_time ?? null,
    onsite_type: (appointment as { onsite_type?: string | null }).onsite_type ?? null,
    encounter_id: encounters.find((e) => e.appointment_id === appointment.id)?.id ?? null,
    status: encounters.find((e) => e.appointment_id === appointment.id)?.status ?? 'scheduled',
    patient: patientsData?.find((p) => p.id === appointment.patient_id) ?? null,
  }))
}
