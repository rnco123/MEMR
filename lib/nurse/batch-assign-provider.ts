import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import type { LocationScope } from '@/lib/locations/scope'
import { isAllowedByLocationScope } from '@/lib/locations/scope'
import { assignDoctorToAppointment } from '@/lib/nurse/assign-provider'

export type BatchAssignItemResult = {
  appointmentId: number
  success: boolean
  encounterId?: number
  error?: string
}

const MAX_BATCH = 50

export async function batchAssignProvider(
  admin: SupabaseClient,
  scope: LocationScope,
  args: {
    appointmentIds: number[]
    doctorId: number
    appointmentDate?: string | null
    appointmentTime?: string | null
    profileId?: string | null
  }
): Promise<{ results: BatchAssignItemResult[]; assigned: number; failed: number }> {
  const uniqueIds = [...new Set(args.appointmentIds.filter((id) => Number.isFinite(id) && id > 0))]
  if (uniqueIds.length === 0) {
    return { results: [], assigned: 0, failed: 0 }
  }
  if (uniqueIds.length > MAX_BATCH) {
    throw new ValidationError(`Cannot assign more than ${MAX_BATCH} appointments at once`)
  }

  const { data: doctor, error: doctorErr } = await admin
    .from('doctors')
    .select('id')
    .eq('id', args.doctorId)
    .maybeSingle()

  if (doctorErr) throw doctorErr
  if (!doctor) throw new ValidationError('Doctor not found')

  const { data: appointments, error: apptErr } = await admin
    .from('appointments')
    .select('id, patient_id, location_id')
    .in('id', uniqueIds)

  if (apptErr) throw apptErr

  const apptMap = new Map((appointments ?? []).map((a) => [Number(a.id), a]))
  const results: BatchAssignItemResult[] = []

  for (const appointmentId of uniqueIds) {
    const appt = apptMap.get(appointmentId)
    if (!appt) {
      results.push({ appointmentId, success: false, error: 'Appointment not found' })
      continue
    }

    const locationId = appt.location_id != null ? Number(appt.location_id) : null
    if (!isAllowedByLocationScope(scope, locationId)) {
      results.push({
        appointmentId,
        success: false,
        error: 'Appointment is outside your assigned locations',
      })
      continue
    }

    const { data: existingEncounter } = await admin
      .from('encounters')
      .select('id, doctor_id')
      .eq('appointment_id', appointmentId)
      .maybeSingle()

    if (existingEncounter?.doctor_id) {
      results.push({
        appointmentId,
        success: false,
        error: 'A provider is already assigned to this visit',
      })
      continue
    }

    try {
      const { encounterId } = await assignDoctorToAppointment(admin, {
        appointmentId,
        doctorId: args.doctorId,
        patientId: appt.patient_id,
        appointmentDate: args.appointmentDate,
        appointmentTime: args.appointmentTime,
        profileId: args.profileId,
      })
      results.push({ appointmentId, success: true, encounterId })
    } catch (err) {
      results.push({
        appointmentId,
        success: false,
        error: err instanceof Error ? err.message : 'Failed to assign provider',
      })
    }
  }

  const assigned = results.filter((r) => r.success).length
  return { results, assigned, failed: results.length - assigned }
}
