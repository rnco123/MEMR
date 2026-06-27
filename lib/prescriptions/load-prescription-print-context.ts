import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import type { PharmEmailClinicInfo, PharmEmailDoctorInfo } from '@/lib/email/resolve-pharm-email-context'
import { resolvePharmEmailDoctorAndClinic } from '@/lib/email/resolve-pharm-email-context'
import {
  loadEncounterForRx,
  normalizePrescriptionRow,
  PRESCRIPTION_SELECT_FULL,
  PRESCRIPTION_SELECT_LEGACY,
  type EncounterRxRow,
} from '@/lib/prescriptions/encounter-prescriptions'
import { normalizePharmacyRow } from '@/lib/pharmacies/normalize'
import { resolveEncounterPatientId } from '@/lib/encounters/resolve-patient-id'

export type PrescriptionPrintPatient = {
  name: string
  date_of_birth: string | null
  phone: string | null
  address: string | null
}

export type PrescriptionPrintPharmacy = {
  name: string | null
  address: string | null
  phone: string | null
  email: string | null
}

export type PrescriptionPrintContext = {
  encounterId: number
  appointmentDate: string | null
  patient: PrescriptionPrintPatient
  doctor: PharmEmailDoctorInfo
  clinic: PharmEmailClinicInfo
  pharmacy: PrescriptionPrintPharmacy | null
  prescriptions: EncounterRxRow[]
  printedAt: string
}

function formatPatientName(row: {
  first_name?: string | null
  last_name?: string | null
}): string {
  return [row.last_name, row.first_name].filter(Boolean).join(', ').trim() || 'Patient'
}

function formatPatientAddress(row: {
  street_address?: string | null
  state?: string | null
  zip_code?: string | null
}): string | null {
  const parts = [row.street_address, row.state, row.zip_code].filter(Boolean).map(String)
  return parts.length > 0 ? parts.join(', ') : null
}

export async function loadPrescriptionPrintContext(
  admin: SupabaseClient,
  encounterId: number,
  options?: { prescriptionIds?: number[] }
): Promise<PrescriptionPrintContext> {
  const encounter = await loadEncounterForRx(admin, encounterId)

  const uniqueIds = options?.prescriptionIds
    ? [...new Set(options.prescriptionIds)].filter((id) => Number.isFinite(id) && id > 0)
    : null

  let rxQuery = admin
    .from('prescriptions')
    .select(PRESCRIPTION_SELECT_FULL)
    .eq('encounter_id', encounterId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })

  if (uniqueIds?.length) {
    rxQuery = rxQuery.in('id', uniqueIds)
  }

  let result = await rxQuery
  if (result.error?.code === '42703') {
    let legacyQuery = admin
      .from('prescriptions')
      .select(PRESCRIPTION_SELECT_LEGACY)
      .eq('encounter_id', encounterId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
    if (uniqueIds?.length) {
      legacyQuery = legacyQuery.in('id', uniqueIds)
    }
    result = (await legacyQuery) as typeof result
  }

  if (result.error) throw result.error

  const prescriptions = (result.data ?? []).map((row) =>
    normalizePrescriptionRow(row as Record<string, unknown>)
  )

  if (prescriptions.length === 0) {
    throw new ValidationError('No prescriptions found to print')
  }

  if (uniqueIds && prescriptions.length !== uniqueIds.length) {
    throw new ValidationError('One or more prescriptions could not be found for this encounter')
  }

  const { data: encounterMeta, error: encounterMetaError } = await admin
    .from('encounters')
    .select('appointment_id, patient_id')
    .eq('id', encounterId)
    .maybeSingle()

  if (encounterMetaError) throw encounterMetaError

  const resolvedPatientId = await resolveEncounterPatientId(admin, {
    patient_id: encounterMeta?.patient_id ?? encounter.patient_id,
    appointment_id: encounterMeta?.appointment_id ?? null,
  })

  if (resolvedPatientId == null) {
    throw new ValidationError('Patient not found for this encounter')
  }

  const { data: patient, error: patientError } = await admin
    .from('patients')
    .select('first_name, last_name, date_of_birth, phone, street_address, state, zip_code')
    .eq('id', resolvedPatientId)
    .maybeSingle()

  if (patientError) throw patientError
  if (!patient) throw new ValidationError('Patient not found')

  let appointmentDate: string | null = null
  if (encounterMeta?.appointment_id != null) {
    const { data: appointmentRow } = await admin
      .from('appointments')
      .select('appointment_date')
      .eq('id', encounterMeta.appointment_id)
      .maybeSingle()
    appointmentDate = (appointmentRow?.appointment_date as string | null) ?? null
  }

  const { doctor, clinic } = await resolvePharmEmailDoctorAndClinic(admin, {
    encounterId,
    patientId: resolvedPatientId,
    doctorId: encounter.doctor_id,
    appointmentId: (encounterMeta?.appointment_id as number | null) ?? null,
  })

  let pharmacy: PrescriptionPrintPharmacy | null = null
  if (encounter.pharmacy_id != null) {
    const { data: pharmacyRow } = await admin
      .from('pharmacy')
      .select('name, address, city, state, zip_code, phone, phone_number, email')
      .eq('id', encounter.pharmacy_id)
      .maybeSingle()

    if (pharmacyRow) {
      const normalized = normalizePharmacyRow(pharmacyRow as Record<string, unknown>)
      pharmacy = {
        name: normalized.name,
        address: normalized.address,
        phone: normalized.phone,
        email: normalized.email,
      }
    }
  }

  return {
    encounterId,
    appointmentDate,
    patient: {
      name: formatPatientName(patient),
      date_of_birth: (patient.date_of_birth as string | null) ?? null,
      phone: (patient.phone as string | null) ?? null,
      address: formatPatientAddress(patient),
    },
    doctor,
    clinic,
    pharmacy,
    prescriptions,
    printedAt: new Date().toISOString(),
  }
}
