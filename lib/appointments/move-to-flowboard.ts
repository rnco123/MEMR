import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFoundError, ValidationError, AuthorizationError } from '@/lib/api-error-handler'
import { getClinicTodayDateString } from '@/lib/datetime/clinic-timezone'
import {
  isAllowedByLocationScope,
  resolveEffectiveLocationId,
  type LocationScope,
} from '@/lib/locations/scope'
import { isFutureFlowboardRow } from '@/lib/locations/flowboard-data'

export type MoveAppointmentToFlowboardResult = {
  appointment_id: number
  appointment_date: string
  previous_appointment_date: string | null
}

/** Move a future appointment to today's clinic calendar date so it appears on the flowboard. */
export async function moveAppointmentToFlowboardToday(
  admin: SupabaseClient,
  scope: LocationScope,
  appointmentId: number
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

  const today = getClinicTodayDateString()
  const previousDate = appointment.appointment_date
  const dateKey = previousDate?.trim().slice(0, 10) ?? ''
  const alreadyToday = dateKey === today

  // A visit dated today is already on the flowboard, so the click has nothing
  // left to do. Only genuinely past-dated visits are a real error.
  if (!alreadyToday && !isFutureFlowboardRow(previousDate, today)) {
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

  // Checked before the no-op return below so an out-of-scope caller can never
  // probe an appointment by reading a success back.
  if (!isAllowedByLocationScope(scope, effectiveLocationId)) {
    throw new AuthorizationError()
  }

  if (alreadyToday) {
    return {
      appointment_id: appointmentId,
      appointment_date: today,
      previous_appointment_date: previousDate,
    }
  }

  const { error: updateErr } = await admin
    .from('appointments')
    .update({ appointment_date: today })
    .eq('id', appointmentId)

  if (updateErr) throw updateErr

  return {
    appointment_id: appointmentId,
    appointment_date: today,
    previous_appointment_date: previousDate,
  }
}
