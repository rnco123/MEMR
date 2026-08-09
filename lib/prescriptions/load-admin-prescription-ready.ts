import type { SupabaseClient } from '@supabase/supabase-js'
import type { PrescriptionReadyAdminStatus } from '@/lib/prescriptions/prescription-ready'
import { formatPharmacyDisplayAddress } from '@/lib/pharmacies/normalize'
import {
  normalizePatientGender,
  type PatientGenderValue,
} from '@/lib/encounter/patient-gender'
import {
  getClinicPrescriptionDateRangeUtc,
  type PrescriptionReadyDateFilter,
} from '@/lib/datetime/clinic-timezone'

export type { PrescriptionReadyDateFilter }

type QueueBaseFilters = {
  status?: PrescriptionReadyAdminStatus | 'all'
  prescriptionDate?: PrescriptionReadyDateFilter
}

function applyQueueBaseFilters<T extends { eq: Function; gte: Function; lt: Function }>(
  query: T,
  filters: QueueBaseFilters
): T {
  let q = query
  if (filters.status && filters.status !== 'all') {
    q = q.eq('admin_status', filters.status) as T
  }
  if (filters.prescriptionDate && filters.prescriptionDate !== 'all') {
    const { startIso, endExclusiveIso } = getClinicPrescriptionDateRangeUtc(filters.prescriptionDate)
    q = q.gte('sent_to_admin_at', startIso).lt('sent_to_admin_at', endExclusiveIso) as T
  }
  return q
}

/** Match encounter access: appointment location, then patient home clinic. */
function resolveEncounterLocationId(
  patientLocationId: number | null | undefined,
  appointmentLocationId: number | null | undefined
): number | null {
  if (appointmentLocationId != null && Number.isFinite(appointmentLocationId)) {
    return Number(appointmentLocationId)
  }
  if (patientLocationId != null && Number.isFinite(patientLocationId)) {
    return Number(patientLocationId)
  }
  return null
}

function readEncounterLocationIds(row: {
  encounters?: unknown
  patients?: unknown
}): number | null {
  const enc = Array.isArray(row.encounters) ? row.encounters[0] : row.encounters
  const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients
  const appt = enc
    ? Array.isArray((enc as { appointments?: unknown }).appointments)
      ? (enc as { appointments: unknown[] }).appointments[0]
      : (enc as { appointments?: unknown }).appointments
    : null
  return resolveEncounterLocationId(
    (patient as { location_id?: number | null } | null | undefined)?.location_id,
    (appt as { location_id?: number | null } | null | undefined)?.location_id
  )
}

export type AdminPrescriptionReadyRow = {
  id: number
  encounter_id: number
  prescription_id: number
  patient_id: number
  pharmacy_id: number | null
  sender_role: string
  sender_name: string | null
  admin_status: PrescriptionReadyAdminStatus
  sent_to_admin_at: string
  admin_status_updated_at: string | null
  admin_status_updated_by: string | null
  admin_status_updated_by_name: string | null
  medication_name: string | null
  strength: string | null
  dosage_instruction: string | null
  quantity: string | null
  refills: number | null
  patient_first_name: string | null
  patient_last_name: string | null
  patient_gender: PatientGenderValue | null
  encounter_code: string | null
  location_id: number | null
  location_title: string | null
  pharmacy_name: string | null
  pharmacy_address: string | null
  pharmacy_phone: string | null
  pharmacy_email: string | null
}

export type EncounterPrescriptionQueueSummary = {
  admin_status: PrescriptionReadyAdminStatus
  admin_status_updated_at: string | null
  admin_status_updated_by_name: string | null
  hasMixedStatus: boolean
}

/** One admin status per encounter (all queue rows on that encounter move together). */
export function summarizeEncounterPrescriptionQueue(
  rows: AdminPrescriptionReadyRow[]
): EncounterPrescriptionQueueSummary {
  if (rows.length === 0) {
    return {
      admin_status: 'pending',
      admin_status_updated_at: null,
      admin_status_updated_by_name: null,
      hasMixedStatus: false,
    }
  }

  const statuses = new Set(rows.map((row) => row.admin_status))
  const admin_status: PrescriptionReadyAdminStatus =
    statuses.size === 1
      ? rows[0]!.admin_status
      : rows.some((row) => row.admin_status === 'pending')
        ? 'pending'
        : 'sent_to_pharmacy'

  const latestUpdated = [...rows]
    .filter((row) => row.admin_status_updated_at)
    .sort(
      (a, b) =>
        new Date(b.admin_status_updated_at!).getTime() -
        new Date(a.admin_status_updated_at!).getTime()
    )[0]

  return {
    admin_status,
    admin_status_updated_at: latestUpdated?.admin_status_updated_at ?? null,
    admin_status_updated_by_name: latestUpdated?.admin_status_updated_by_name ?? null,
    hasMixedStatus: statuses.size > 1,
  }
}

export async function loadAdminPrescriptionReadyRows(
  admin: SupabaseClient,
  filters: {
    pharmacyIds?: number[]
    locationIds?: number[]
    status?: PrescriptionReadyAdminStatus | 'all'
    prescriptionDate?: PrescriptionReadyDateFilter
    gender?: PatientGenderValue | 'all'
  }
): Promise<AdminPrescriptionReadyRow[]> {
  let query = admin
    .from('prescription_ready')
    .select(
      `
      id,
      encounter_id,
      prescription_id,
      patient_id,
      pharmacy_id,
      sender_role,
      sender_name,
      admin_status,
      sent_to_admin_at,
      admin_status_updated_at,
      admin_status_updated_by,
      prescriptions (
        medication_name,
        strength,
        dosage_instruction,
        quantity,
        refills
      ),
      patients (
        first_name,
        last_name,
        gender,
        location_id
      ),
      encounters (
        encounter_code,
        appointment_id,
        appointments:appointment_id (
          location_id
        )
      ),
      pharmacy:pharmacy_id (
        name,
        address,
        city,
        state,
        zip_code,
        phone,
        email
      )
    `
    )
    .order('sent_to_admin_at', { ascending: false })

  query = applyQueueBaseFilters(query, { prescriptionDate: filters.prescriptionDate })

  if (filters.pharmacyIds?.length) {
    query = query.in('pharmacy_id', filters.pharmacyIds)
  }

  const { data, error } = await query
  if (error) throw error

  const updaterIds = [
    ...new Set(
      (data ?? [])
        .map((row) => row.admin_status_updated_by as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ]

  const updaterNameByUid = new Map<string, string>()
  if (updaterIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('uid, full_name, email')
      .in('uid', updaterIds)
    for (const profile of profiles ?? []) {
      const uid = profile.uid as string | null
      if (!uid) continue
      const name =
        (profile.full_name as string | null)?.trim() ||
        (profile.email as string | null)?.trim() ||
        null
      if (name) updaterNameByUid.set(uid, name)
    }
  }

  const locationTitleById = new Map<number, string>()
  const locationIdsInRows = [
    ...new Set(
      (data ?? [])
        .map((row) => readEncounterLocationIds(row))
        .filter((id): id is number => id != null)
    ),
  ]
  if (locationIdsInRows.length > 0) {
    const { data: locations } = await admin
      .from('locations')
      .select('id, title')
      .in('id', locationIdsInRows)
    for (const loc of locations ?? []) {
      const id = Number(loc.id)
      const title = (loc.title as string | null)?.trim()
      if (Number.isFinite(id) && title) locationTitleById.set(id, title)
    }
  }

  const rows: AdminPrescriptionReadyRow[] = (data ?? []).map((row) => {
    const rx = Array.isArray(row.prescriptions) ? row.prescriptions[0] : row.prescriptions
    const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients
    const enc = Array.isArray(row.encounters) ? row.encounters[0] : row.encounters
    const pharm = Array.isArray(row.pharmacy) ? row.pharmacy[0] : row.pharmacy

    const locationId = readEncounterLocationIds(row)

    return {
      id: Number(row.id),
      encounter_id: Number(row.encounter_id),
      prescription_id: Number(row.prescription_id),
      patient_id: Number(row.patient_id),
      pharmacy_id: row.pharmacy_id != null ? Number(row.pharmacy_id) : null,
      sender_role: String(row.sender_role ?? ''),
      sender_name: (row.sender_name as string | null) ?? null,
      admin_status: row.admin_status as PrescriptionReadyAdminStatus,
      sent_to_admin_at: String(row.sent_to_admin_at ?? ''),
      admin_status_updated_at: (row.admin_status_updated_at as string | null) ?? null,
      admin_status_updated_by: (row.admin_status_updated_by as string | null) ?? null,
      admin_status_updated_by_name: row.admin_status_updated_by
        ? (updaterNameByUid.get(String(row.admin_status_updated_by)) ?? null)
        : null,
      medication_name: (rx?.medication_name as string | null) ?? null,
      strength: (rx?.strength as string | null) ?? null,
      dosage_instruction: (rx?.dosage_instruction as string | null) ?? null,
      quantity: (rx?.quantity as string | null) ?? null,
      refills: rx?.refills != null ? Number(rx.refills) : null,
      patient_first_name: (patient?.first_name as string | null) ?? null,
      patient_last_name: (patient?.last_name as string | null) ?? null,
      patient_gender: normalizePatientGender(patient?.gender as string | null),
      encounter_code: (enc?.encounter_code as string | null) ?? null,
      location_id: locationId,
      location_title: locationId != null ? (locationTitleById.get(locationId) ?? null) : null,
      pharmacy_name: (pharm?.name as string | null) ?? null,
      pharmacy_address: pharm ? formatPharmacyDisplayAddress(pharm as Record<string, unknown>) : null,
      pharmacy_phone: (pharm?.phone as string | null) ?? null,
      pharmacy_email: (pharm?.email as string | null) ?? null,
    }
  })

  let filtered = rows

  if (filters.locationIds?.length) {
    filtered = filtered.filter(
      (row) => row.location_id != null && filters.locationIds!.includes(row.location_id)
    )
  }

  // Legacy rows store mixed-case gender values, so compare on the normalized field.
  if (filters.gender && filters.gender !== 'all') {
    filtered = filtered.filter((row) => row.patient_gender === filters.gender)
  }

  if (filters.status && filters.status !== 'all') {
    const byEncounter = new Map<number, AdminPrescriptionReadyRow[]>()
    for (const row of filtered) {
      const list = byEncounter.get(row.encounter_id) ?? []
      list.push(row)
      byEncounter.set(row.encounter_id, list)
    }
    const allowedEncounterIds = new Set<number>()
    for (const [encounterId, encRows] of byEncounter) {
      if (summarizeEncounterPrescriptionQueue(encRows).admin_status === filters.status) {
        allowedEncounterIds.add(encounterId)
      }
    }
    filtered = filtered.filter((row) => allowedEncounterIds.has(row.encounter_id))
  }

  return filtered
}

export type PrescriptionReadyPharmacyOption = { id: number; name: string }
export type PrescriptionReadyLocationOption = { id: number; title: string }

/** Pharmacies that appear on at least one queue row (not the full pharmacy catalog). */
export async function loadPrescriptionReadyPharmacyOptions(
  admin: SupabaseClient,
  filters: QueueBaseFilters
): Promise<PrescriptionReadyPharmacyOption[]> {
  let query = admin
    .from('prescription_ready')
    .select('pharmacy_id, pharmacy:pharmacy_id ( id, name )')
    .not('pharmacy_id', 'is', null)

  query = applyQueueBaseFilters(query, filters)

  const { data, error } = await query
  if (error) throw error

  const byId = new Map<number, string>()
  for (const row of data ?? []) {
    const pharmacyId = row.pharmacy_id != null ? Number(row.pharmacy_id) : null
    if (pharmacyId == null || !Number.isFinite(pharmacyId)) continue
    const pharm = Array.isArray(row.pharmacy) ? row.pharmacy[0] : row.pharmacy
    const name = (pharm?.name as string | null)?.trim()
    if (!name) continue
    byId.set(pharmacyId, name)
  }

  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Clinic locations that appear on at least one queue row (not the full locations catalog). */
export async function loadPrescriptionReadyLocationOptions(
  admin: SupabaseClient,
  filters: QueueBaseFilters
): Promise<PrescriptionReadyLocationOption[]> {
  let query = admin
    .from('prescription_ready')
    .select(
      `
      encounters (
        appointment_id,
        appointments:appointment_id ( location_id )
      ),
      patients ( location_id )
    `
    )

  query = applyQueueBaseFilters(query, filters)

  const { data, error } = await query
  if (error) throw error

  const locationIds = [
    ...new Set(
      (data ?? [])
        .map((row) => readEncounterLocationIds(row))
        .filter((id): id is number => id != null)
    ),
  ]
  if (locationIds.length === 0) return []

  const { data: locations, error: locError } = await admin
    .from('locations')
    .select('id, title')
    .in('id', locationIds)
    .order('title', { ascending: true })

  if (locError) throw locError

  return (locations ?? [])
    .map((loc) => ({
      id: Number(loc.id),
      title: String(loc.title ?? '').trim(),
    }))
    .filter((loc) => loc.title.length > 0)
}
