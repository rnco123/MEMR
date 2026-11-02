import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFoundError, ValidationError, AuthorizationError } from '@/lib/api-error-handler'
import { getClinicTodayDateString } from '@/lib/datetime/clinic-timezone'
import {
  isAllowedByLocationScope,
  resolveEffectiveLocationId,
  type LocationScope,
} from '@/lib/locations/scope'
import { isFutureFlowboardRow } from '@/lib/locations/flowboard-data'
import { assignDoctorToAppointment } from '@/lib/nurse/assign-provider'

export type MoveAppointmentToFlowboardResult = {
  appointment_id: number
  appointment_date: string
  previous_appointment_date: string | null
  /** Set when the visit had no provider and was assigned to the mover. */
  assigned_doctor_id: number | null
}

export type MoveAppointmentToFlowboardOptions = {
  /**
   * Provider (doctor/FNP/PA) moving the visit. The provider waiting room only lists
   * visits assigned to that provider, so an unassigned visit is claimed by them.
   */
  assignToDoctorId?: number | null
  profileId?: string | null
}

/** Move a future appointment to today's clinic calendar date so it appears on the flowboard. */
export async function moveAppointmentToFlowboardToday(
  admin: SupabaseClient,
  scope: LocationScope,
  appointmentId: number,
  options: MoveAppointmentToFlowboardOptions = {}
): Promise<MoveAppointmentToFlowboardResult> {
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    throw new ValidationError('Invalid appointment id')
  }

  const { data: appointment, error: apptErr } = await admin
    .from('appointments')
    .select('id, patient_id, appointment_date, appointment_time, location_id')
    .eq('id', appointmentId)
    .maybeSingle()

  if (apptErr) throw apptErr
  if (!appointment) throw new NotFoundError('Appointment not found')

  if (!isFutureFlowboardRow(appointment.appointment_date)) {
    throw new ValidationError('Only future appointments can be moved to the waiting room')
  }

  const { data: patient } = await admin
    .from('patients')
    .select('location_id')
    .eq('id', appointment.patient_id)
    .maybeSingle()

  const effectiveLocationId = resolveEffectiveLocationId(
    patient?.location_id,
    appointment.location_id
  )

  if (!isAllowedByLocationScope(scope, effectiveLocationId)) {
    throw new AuthorizationError()
  }

  const today = getClinicTodayDateString()
  const previousDate = appointment.appointment_date

  const { error: updateErr } = await admin
    .from('appointments')
    .update({ appointment_date: today })
    .eq('id', appointmentId)

  if (updateErr) throw updateErr

  let assignedDoctorId: number | null = null
  if (options.assignToDoctorId != null) {
    const { data: encounter, error: encErr } = await admin
      .from('encounters')
      .select('id, doctor_id')
      .eq('appointment_id', appointmentId)
      .maybeSingle()

    if (encErr) throw encErr

    if (!encounter?.doctor_id) {
      await assignDoctorToAppointment(admin, {
        appointmentId,
        doctorId: options.assignToDoctorId,
        patientId: appointment.patient_id,
        profileId: options.profileId,
      })
      assignedDoctorId = options.assignToDoctorId
    }
  }

  return {
    appointment_id: appointmentId,
    appointment_date: today,
    previous_appointment_date: previousDate,
    assigned_doctor_id: assignedDoctorId,
  }
}
