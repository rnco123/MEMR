import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { PATIENT_INFO_SELECT } from '@/lib/encounter/encounter-patient-info'
import { loadLatestVitalsForEncounter } from '@/lib/vitals/load-encounter-vitals'
import { loadActivePharmacyRegistry, loadPharmacyById } from '@/lib/pharmacies/load-active-registry'
import {
  AI_SOAP_SELECT,
  APPOINTMENT_DETAIL_SELECT,
  ENCOUNTER_DETAIL_SELECT,
  PATIENT_DETAIL_SELECT,
  PATIENT_FILE_SELECT,
  PRE_SALES_SELECT,
  PRESCRIPTION_LIST_SELECT,
} from '@/lib/encounters/encounter-detail-selects'
import { loadAiSoapForEncounter } from '@/lib/encounters/load-ai-soap-for-encounter'
import { loadIntakeForEncounter } from '@/lib/encounters/load-intake-for-encounter'

export type EncounterDetailPayload = {
  encounter: Record<string, unknown>
  appointment: Record<string, unknown> | null
  patient: Record<string, unknown> | null
  intake: Record<string, unknown> | null
  vitals: Record<string, unknown> | null
  ai_soap: Record<string, unknown> | null
  pharmacy: Record<string, unknown> | null
  pharmacy_registry: Record<string, unknown>[]
  prescriptions: Record<string, unknown>[]
  pre_sales: Record<string, unknown>[]
}

export async function loadEncounterDetail(
  admin: SupabaseClient,
  encounterId: number,
  options?: { includePharmacyRegistry?: boolean; includePrescriptions?: boolean; includePreSales?: boolean }
): Promise<EncounterDetailPayload> {
  const { data: encounter, error: encErr } = await admin
    .from('encounters')
    .select(ENCOUNTER_DETAIL_SELECT)
    .eq('id', encounterId)
    .maybeSingle()

  if (encErr) throw encErr
  if (!encounter) throw new ValidationError('Encounter not found')

  const appointmentId = encounter.appointment_id != null ? Number(encounter.appointment_id) : null
  const patientId = encounter.patient_id != null ? Number(encounter.patient_id) : null
  const pharmacyId = encounter.pharmacy_id != null ? Number(encounter.pharmacy_id) : null

  let appointment: Record<string, unknown> | null = null
  let patient: Record<string, unknown> | null = null

  if (appointmentId && Number.isFinite(appointmentId)) {
    const { data: appt, error: apptErr } = await admin
      .from('appointments')
      .select(
        `${APPOINTMENT_DETAIL_SELECT}, patients:patient_id (${PATIENT_DETAIL_SELECT})`
      )
      .eq('id', appointmentId)
      .maybeSingle()
    if (apptErr) throw apptErr
    if (appt) {
      appointment = appt as Record<string, unknown>
      const linked = appt.patients
      if (linked && typeof linked === 'object' && !Array.isArray(linked)) {
        patient = linked as Record<string, unknown>
      }
    }
  }

  if (!patient && patientId && Number.isFinite(patientId)) {
    const { data: pat, error: patErr } = await admin
      .from('patients')
      .select(PATIENT_DETAIL_SELECT)
      .eq('id', patientId)
      .maybeSingle()
    if (patErr) throw patErr
    patient = (pat as Record<string, unknown> | null) ?? null
  }

  const intakeId = encounter.intake_id != null ? Number(encounter.intake_id) : null
  const intake = await loadIntakeForEncounter(admin, intakeId, appointmentId)
  const vitals = await loadLatestVitalsForEncounter(admin, encounterId)
  const ai_soap = await loadAiSoapForEncounter(admin, encounterId, appointmentId, AI_SOAP_SELECT)

  const pharmacy = pharmacyId && Number.isFinite(pharmacyId) ? await loadPharmacyById(admin, pharmacyId) : null
  const pharmacy_registry =
    options?.includePharmacyRegistry === true ? await loadActivePharmacyRegistry(admin) : []

  let prescriptions: Record<string, unknown>[] = []
  if (options?.includePrescriptions === true) {
    const { data: rxRows, error: rxErr } = await admin
      .from('prescriptions')
      .select(PRESCRIPTION_LIST_SELECT)
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: true })
    if (rxErr) throw rxErr
    prescriptions = (rxRows ?? []) as Record<string, unknown>[]
  }

  let pre_sales: Record<string, unknown>[] = []
  if (options?.includePreSales === true) {
    const { data: psRows, error: psErr } = await admin
      .from('pre_sales')
      .select(PRE_SALES_SELECT)
      .eq('encounter_id', encounterId)
    if (psErr) throw psErr
    pre_sales = (psRows ?? []) as Record<string, unknown>[]
  }

  return {
    encounter: encounter as Record<string, unknown>,
    appointment,
    patient,
    intake: (intake as Record<string, unknown> | null) ?? null,
    vitals: (vitals as Record<string, unknown> | null) ?? null,
    ai_soap: (ai_soap as Record<string, unknown> | null) ?? null,
    pharmacy: (pharmacy as Record<string, unknown> | null) ?? null,
    pharmacy_registry,
    prescriptions,
    pre_sales,
  }
}

/** Minimal patient row for patient file header. */
export async function loadPatientFileHeader(admin: SupabaseClient, patientId: number) {
  const { data, error } = await admin
    .from('patients')
    .select(PATIENT_FILE_SELECT)
    .eq('id', patientId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new ValidationError('Patient not found')
  return data as Record<string, unknown>
}

/** Patient demographics via encounter appointment chain. */
export async function loadPatientForEncounterDetail(
  admin: SupabaseClient,
  encounterId: number
) {
  const { data: encounter, error: encErr } = await admin
    .from('encounters')
    .select('id, appointment_id, patient_id')
    .eq('id', encounterId)
    .maybeSingle()

  if (encErr) throw encErr
  if (!encounter) throw new ValidationError('Encounter not found')

  const appointmentId = Number(encounter.appointment_id)
  if (Number.isFinite(appointmentId) && appointmentId > 0) {
    const { data: appointment, error: apptErr } = await admin
      .from('appointments')
      .select(`patient_id, patients:patient_id (${PATIENT_INFO_SELECT})`)
      .eq('id', appointmentId)
      .maybeSingle()
    if (apptErr) throw apptErr
    const linked = appointment?.patients
    if (linked && typeof linked === 'object' && !Array.isArray(linked)) {
      return linked as Record<string, unknown>
    }
  }

  const patientId = Number(encounter.patient_id)
  if (Number.isFinite(patientId) && patientId > 0) {
    const { data: pat, error: patErr } = await admin
      .from('patients')
      .select(PATIENT_INFO_SELECT)
      .eq('id', patientId)
      .maybeSingle()
    if (patErr) throw patErr
    return pat as Record<string, unknown> | null
  }

  return null
}
