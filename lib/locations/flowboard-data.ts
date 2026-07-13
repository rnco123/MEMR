import type { SupabaseClient } from '@supabase/supabase-js'
import { getClinicTodayDateString } from '@/lib/datetime/clinic-timezone'
import {
  isAllowedByLocationScope,
  resolveEffectiveLocationId,
  type LocationScope,
} from '@/lib/locations/scope'

/**
 * Flowboard hides only past appointments that are completed.
 * Today/future and any non-completed row (including stale in-progress visits) stay visible.
 */
export function isActiveFlowboardRow(
  appointmentDate: string | null | undefined,
  encounterStatus: string | null | undefined,
  todayDate = getClinicTodayDateString()
): boolean {
  const dateKey = appointmentDate?.trim().slice(0, 10) ?? ''
  if (!dateKey || dateKey >= todayDate) return true
  return encounterStatus !== 'completed'
}

export type FlowboardRow = {
  id: number
  patient_id: number
  appointment_date: string | null
  appointment_time: string | null
  onsite_type: string
  created_at: string
  location_id: number | null
  location_title: string | null
  encounter_status: string | null
  encounter_id: number | null
  assigned_doctor?: {
    id: number
    full_name: string
    email: string | null
  }
  patient?: {
    id: number
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    date_of_birth: string | null
    location_id?: number | null
    created_by_source?: string | null
  } | null
}

type BuildFlowboardOptions = {
  mode: 'nurse' | 'doctor' | 'admin'
  doctorId?: number | null
  locationFilterId?: number
}

export async function buildFlowboardRows(
  admin: SupabaseClient,
  scope: LocationScope,
  options: BuildFlowboardOptions
): Promise<FlowboardRow[]> {
  const { data: appointments, error: appointmentsError } = await admin
    .from('appointments')
    .select('id, patient_id, appointment_date, appointment_time, onsite_type, created_at, location_id')
    .order('appointment_date', { ascending: true })
    .order('appointment_time', { ascending: true })

  if (appointmentsError) throw appointmentsError
  if (!appointments?.length) return []

  const patientIds = [...new Set(appointments.map((a) => a.patient_id).filter(Boolean))]
  const appointmentIds = appointments.map((a) => a.id)

  const [{ data: patients }, { data: encounters }] = await Promise.all([
    admin
      .from('patients')
      .select('id, first_name, last_name, email, phone, date_of_birth, location_id, created_by_source')
      .in('id', patientIds),
    admin
      .from('encounters')
      .select('id, appointment_id, status, doctor_id')
      .in('appointment_id', appointmentIds),
  ])

  const locationIds = new Set<number>()
  for (const p of patients ?? []) {
    if (p.location_id != null) locationIds.add(p.location_id)
  }
  for (const a of appointments) {
    if (a.location_id != null) locationIds.add(a.location_id)
  }

  const locationTitles: Record<number, string> = {}
  if (locationIds.size > 0) {
    const { data: locs } = await admin
      .from('locations')
      .select('id, title')
      .in('id', [...locationIds])
    for (const loc of locs ?? []) {
      locationTitles[loc.id] = loc.title
    }
  }

  const doctorIds = [...new Set((encounters ?? []).map((e) => e.doctor_id).filter(Boolean))] as number[]
  const doctorsById: Record<number, { id: number; full_name: string; email: string | null }> = {}
  if (doctorIds.length > 0) {
    const { data: docs } = await admin.from('doctors').select('id, full_name, email').in('id', doctorIds)
    for (const d of docs ?? []) {
      doctorsById[d.id] = d
    }
  }

  const rows: FlowboardRow[] = []

  for (const appointment of appointments) {
    const patient = patients?.find((p) => p.id === appointment.patient_id)
    const effectiveLocationId = resolveEffectiveLocationId(
      patient?.location_id,
      appointment.location_id
    )

    if (options.locationFilterId != null && effectiveLocationId !== options.locationFilterId) {
      continue
    }

    if (!isAllowedByLocationScope(scope, effectiveLocationId)) {
      continue
    }

    const encounter = encounters?.find((e) => e.appointment_id === appointment.id)

    if (!isActiveFlowboardRow(appointment.appointment_date, encounter?.status ?? null)) continue

    if (options.mode === 'doctor') {
      if (options.doctorId == null) continue
      if (!encounter || encounter.doctor_id !== options.doctorId) continue
    }

    const assignedDoctor =
      encounter?.doctor_id != null ? doctorsById[encounter.doctor_id] : undefined

    rows.push({
      id: appointment.id,
      patient_id: appointment.patient_id,
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      onsite_type: appointment.onsite_type ?? '',
      created_at: appointment.created_at,
      location_id: effectiveLocationId,
      location_title: effectiveLocationId != null ? locationTitles[effectiveLocationId] ?? null : null,
      encounter_status: encounter?.status ?? null,
      encounter_id: encounter?.id ?? null,
      assigned_doctor: assignedDoctor
        ? {
            id: assignedDoctor.id,
            full_name: assignedDoctor.full_name,
            email: assignedDoctor.email,
          }
        : undefined,
      patient: patient
        ? {
            id: patient.id,
            first_name: patient.first_name,
            last_name: patient.last_name,
            email: patient.email,
            phone: patient.phone,
            date_of_birth: patient.date_of_birth,
            location_id: patient.location_id,
            created_by_source: (patient as { created_by_source?: string | null }).created_by_source ?? 'QR',
          }
        : null,
    })
  }

  return rows
}

export async function getDoctorIdForUser(
  admin: SupabaseClient,
  userId: string
): Promise<number | null> {
  const { data } = await admin.from('doctors').select('id').eq('user_id', userId).maybeSingle()
  return data?.id ?? null
}
