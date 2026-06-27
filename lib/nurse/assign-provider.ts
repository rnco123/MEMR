import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { insertStatusTimeline } from '@/lib/status-timeline'

export type AssignProviderInput = {
  appointmentId: number
  doctorId: number
  patientId?: number | null
  appointmentDate?: string | null
  appointmentTime?: string | null
  /** Profile id for status timeline (optional). */
  profileId?: string | null
}

export type AssignProviderResult = {
  encounterId: number
  created: boolean
}

/** Assign a doctor to an appointment (creates or updates the encounter). */
export async function assignDoctorToAppointment(
  admin: SupabaseClient,
  input: AssignProviderInput
): Promise<AssignProviderResult> {
  const { appointmentId, doctorId } = input
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    throw new ValidationError('Invalid appointment id')
  }
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    throw new ValidationError('Invalid doctor id')
  }

  let patientId = input.patientId ?? null
  if (!patientId) {
    const { data: apptRow, error: apptErr } = await admin
      .from('appointments')
      .select('patient_id')
      .eq('id', appointmentId)
      .maybeSingle()
    if (apptErr) throw apptErr
    patientId = apptRow?.patient_id ?? null
  }

  if (input.appointmentDate || input.appointmentTime) {
    const updateData: { appointment_date?: string; appointment_time?: string } = {}
    if (input.appointmentDate) updateData.appointment_date = input.appointmentDate
    if (input.appointmentTime) updateData.appointment_time = input.appointmentTime

    const { error: updateError } = await admin
      .from('appointments')
      .update(updateData)
      .eq('id', appointmentId)

    if (updateError) throw updateError
  }

  const { data: existingEncounter, error: lookupErr } = await admin
    .from('encounters')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  if (lookupErr) throw lookupErr

  let encounterId: number
  let created = false

  if (existingEncounter?.id) {
    const updatePayload: {
      doctor_id: number
      status: string
      updated_at: string
      patient_id?: number
    } = {
      doctor_id: doctorId,
      status: 'provider_assigned',
      updated_at: new Date().toISOString(),
    }
    if (patientId) updatePayload.patient_id = patientId

    const { error } = await admin
      .from('encounters')
      .update(updatePayload)
      .eq('id', existingEncounter.id)

    if (error) throw error
    encounterId = existingEncounter.id
  } else {
    const { data: inserted, error } = await admin
      .from('encounters')
      .insert({
        appointment_id: appointmentId,
        patient_id: patientId,
        doctor_id: doctorId,
        status: 'provider_assigned',
      })
      .select('id')
      .single()

    if (error) throw error
    encounterId = Number(inserted.id)
    created = true
  }

  if (input.profileId) {
    await insertStatusTimeline(admin, {
      encounterId,
      status: 'provider_assigned',
      profileId: input.profileId,
    })
  }

  return { encounterId, created }
}
