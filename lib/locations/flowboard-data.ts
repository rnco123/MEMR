import type { SupabaseClient } from '@supabase/supabase-js'
import { getClinicTodayDateString } from '@/lib/datetime/clinic-timezone'
import {
  isAllowedByLocationScope,
  resolveEffectiveLocationId,
  type LocationScope,
} from '@/lib/locations/scope'
import { compareActivityDesc, latestActivityTimestamp } from '@/lib/flowboard/activity-sort'

/** Appointment date (YYYY-MM-DD) is after today in clinic (Central) time. */
export function isFutureFlowboardRow(
  appointmentDate: string | null | undefined,
  todayDate = getClinicTodayDateString()
): boolean {
  const dateKey = appointmentDate?.trim().slice(0, 10) ?? ''
  return Boolean(dateKey && dateKey > todayDate)
}

/**
 * Flowboard: today + overdue non-completed visits only.
 * Future-dated appointments appear on the Appointments tab until their clinic calendar day.
 */
export function isActiveFlowboardRow(
  appointmentDate: string | null | undefined,
  encounterStatus: string | null | undefined,
  todayDate = getClinicTodayDateString()
): boolean {
  if (encounterStatus === 'completed') return false
  const dateKey = appointmentDate?.trim().slice(0, 10) ?? ''
  if (!dateKey) return true
  if (isFutureFlowboardRow(dateKey, todayDate)) return false
  return true
}

export type FlowboardRow = {
  id: number
  patient_id: number
  appointment_date: string | null
  appointment_time: string | null
  onsite_type: string
  service_id: number | null
  service_title_en: string | null
  service_title_es: string | null
  location_tenant_id: number | null
  created_at: string
  activity_at: string
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
  /** active = flowboard (today + overdue); future = Appointments tab only */
  dateScope?: 'active' | 'future'
}

export async function buildFlowboardRows(
  admin: SupabaseClient,
  scope: LocationScope,
  options: BuildFlowboardOptions
): Promise<FlowboardRow[]> {
  const dateScope = options.dateScope ?? 'active'
  const todayDate = getClinicTodayDateString()

  let appointmentsQuery = admin
    .from('appointments')
    .select('id, patient_id, appointment_date, appointment_time, onsite_type, service_id, created_at, location_id')

  // Same date bounds as isFutureFlowboardRow/isActiveFlowboardRow, pushed to the DB
  // so the appointment_date index prunes the scan; exact filtering still happens below.
  if (dateScope === 'future') {
    appointmentsQuery = appointmentsQuery.gt('appointment_date', todayDate)
  } else {
    appointmentsQuery = appointmentsQuery.or(
      `appointment_date.is.null,appointment_date.lte.${todayDate}`
    )
  }

  const { data: appointments, error: appointmentsError } = await appointmentsQuery

  if (appointmentsError) throw appointmentsError
  if (!appointments?.length) return []

  const patientIds = [...new Set(appointments.map((a) => a.patient_id).filter(Boolean))]
  const appointmentIds = appointments.map((a) => a.id)

  const serviceIds = [...new Set(appointments.map((a) => a.service_id).filter(Boolean))] as number[]

  const [{ data: patients }, { data: encounters }, { data: services }] = await Promise.all([
    admin
      .from('patients')
      .select('id, first_name, last_name, email, phone, date_of_birth, location_id, created_by_source')
      .in('id', patientIds),
    admin
      .from('encounters')
      .select('id, appointment_id, status, doctor_id, created_at, updated_at')
      .in('appointment_id', appointmentIds),
    serviceIds.length > 0
      ? admin.from('services').select('id, title_en, title_es').in('id', serviceIds)
      : Promise.resolve({ data: [] as { id: number; title_en: string; title_es: string | null }[] }),
  ])

  const servicesById: Record<number, { title_en: string; title_es: string | null }> = {}
  for (const service of services ?? []) {
    servicesById[service.id] = { title_en: service.title_en, title_es: service.title_es }
  }

  const locationIds = new Set<number>()
  for (const p of patients ?? []) {
    if (p.location_id != null) locationIds.add(p.location_id)
  }
  for (const a of appointments) {
    if (a.location_id != null) locationIds.add(a.location_id)
  }

  const locationTitles: Record<number, string> = {}
  const locationTenantIds: Record<number, number | null> = {}
  if (locationIds.size > 0) {
    const { data: locs } = await admin
      .from('locations')
      .select('id, title, tenant_id')
      .in('id', [...locationIds])
    for (const loc of locs ?? []) {
      locationTitles[loc.id] = loc.title
      locationTenantIds[loc.id] = (loc as { tenant_id?: number | null }).tenant_id ?? null
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

    if (dateScope === 'future') {
      if (!isFutureFlowboardRow(appointment.appointment_date)) continue
    } else if (!isActiveFlowboardRow(appointment.appointment_date, encounter?.status ?? null)) {
      continue
    }

    if (dateScope !== 'future' && options.mode === 'doctor') {
      if (options.doctorId == null) continue
      if (!encounter || encounter.doctor_id !== options.doctorId) continue
    }

    const assignedDoctor =
      encounter?.doctor_id != null ? doctorsById[encounter.doctor_id] : undefined

    const service = appointment.service_id != null ? servicesById[appointment.service_id] : undefined

    rows.push({
      id: appointment.id,
      patient_id: appointment.patient_id,
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      onsite_type: appointment.onsite_type ?? '',
      service_id: appointment.service_id ?? null,
      service_title_en: service?.title_en ?? null,
      service_title_es: service?.title_es ?? null,
      location_tenant_id:
        effectiveLocationId != null ? locationTenantIds[effectiveLocationId] ?? null : null,
      created_at: appointment.created_at,
      activity_at: latestActivityTimestamp(
        appointment.created_at,
        (encounter as { created_at?: string | null; updated_at?: string | null } | undefined)
          ?.updated_at,
        (encounter as { created_at?: string | null; updated_at?: string | null } | undefined)
          ?.created_at
      ),
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

  rows.sort(compareActivityDesc)

  return rows
}

export async function getDoctorIdForUser(
  admin: SupabaseClient,
  userId: string
): Promise<number | null> {
  const { data } = await admin.from('doctors').select('id').eq('user_id', userId).maybeSingle()
  return data?.id ?? null
}
