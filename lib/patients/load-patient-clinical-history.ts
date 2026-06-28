import type { SupabaseClient } from '@supabase/supabase-js'
import { INTAKE_FORM_DETAIL_SELECT } from '@/lib/encounters/encounter-detail-selects'

const VITALS_HISTORY_SELECT =
  'id, encounter_id, bp_systolic, bp_diastolic, heart_rate, respiratory_rate, temperature, temperature_unit, spo2, weight, weight_unit, height, height_unit, bmi, notes, created_at'

const MAX_APPOINTMENTS = 200

export async function loadPatientClinicalHistory(admin: SupabaseClient, patientId: number) {
  const { data: appointments, error: appointmentsError } = await admin
    .from('appointments')
    .select('id')
    .eq('patient_id', patientId)
    .order('appointment_date', { ascending: false })
    .limit(MAX_APPOINTMENTS)

  if (appointmentsError) throw appointmentsError
  if (!appointments?.length) {
    return { medical_history: null, medications: [], pharmacy: null }
  }

  const appointmentIds = appointments.map((a) => a.id)

  const { data: encounters, error: encountersError } = await admin
    .from('encounters')
    .select('id, appointment_id, pharmacy_id, created_at')
    .in('appointment_id', appointmentIds)

  if (encountersError) throw encountersError

  const encounterIds = (encounters ?? []).map((e) => e.id)

  const { data: intakeForms, error: intakeError } = await admin
    .from('intake_form')
    .select(INTAKE_FORM_DETAIL_SELECT)
    .in('appointment_id', appointmentIds)
    .order('created_at', { ascending: false })
    .limit(MAX_APPOINTMENTS)

  if (intakeError) throw intakeError

  let vitalsData: Record<string, unknown>[] = []
  if (encounterIds.length > 0) {
    const { data: vitalsRows, error: vitalsError } = await admin
      .from('vitals')
      .select(VITALS_HISTORY_SELECT)
      .in('encounter_id', encounterIds)
      .order('created_at', { ascending: false })
      .limit(MAX_APPOINTMENTS)

    if (vitalsError) throw vitalsError
    vitalsData = (vitalsRows ?? []) as Record<string, unknown>[]
  }

  const forms = intakeForms ?? []

  const aggregatedHistory = {
    medical_conditions: [] as unknown[],
    surgeries: [] as unknown[],
    allergies: [] as unknown[],
    current_medications: [] as unknown[],
    family_history: {
      diabetes: false,
      hypertension: false,
      cancer: false,
      heart_disease: false,
    },
    lifestyle: {
      tobacco_use: false,
      alcohol_use: false,
      drug_use: false,
    },
    vitals: vitalsData,
    latest_intake: forms[0] ?? null,
    latest_vitals: vitalsData[0] ?? null,
  }

  for (const form of forms) {
    const row = form as Record<string, unknown>
    if (Array.isArray(row.medical_conditions)) {
      aggregatedHistory.medical_conditions.push(...row.medical_conditions)
    }
    if (Array.isArray(row.surgeries)) {
      aggregatedHistory.surgeries.push(...row.surgeries)
    }
    if (Array.isArray(row.allergies)) {
      aggregatedHistory.allergies.push(...row.allergies)
    }
    if (Array.isArray(row.current_medications)) {
      aggregatedHistory.current_medications.push(...row.current_medications)
    }
    if (row.fh_diabetes) aggregatedHistory.family_history.diabetes = true
    if (row.fh_hypertension) aggregatedHistory.family_history.hypertension = true
    if (row.fh_cancer) aggregatedHistory.family_history.cancer = true
    if (row.fh_heart_disease) aggregatedHistory.family_history.heart_disease = true
    if (row.tobacco_use) aggregatedHistory.lifestyle.tobacco_use = true
    if (row.alcohol_use) aggregatedHistory.lifestyle.alcohol_use = true
    if (row.drug_use) aggregatedHistory.lifestyle.drug_use = true
  }

  aggregatedHistory.medical_conditions = [...new Set(aggregatedHistory.medical_conditions)]
  aggregatedHistory.surgeries = [...new Set(aggregatedHistory.surgeries)]
  aggregatedHistory.allergies = [...new Set(aggregatedHistory.allergies)]
  aggregatedHistory.current_medications = [...new Set(aggregatedHistory.current_medications)]

  if (forms.length === 0 && vitalsData.length === 0) {
    return { medical_history: null, medications: [], pharmacy: null }
  }

  const medications = forms
    .filter((f) => {
      const meds = (f as Record<string, unknown>).current_medications
      return meds != null
    })
    .flatMap((form) => {
      const f = form as Record<string, unknown>
      const meds = f.current_medications
      if (!Array.isArray(meds)) return []
      return meds.map((med: unknown) => {
        const normalized =
          typeof med === 'string' ? { name: med } : med && typeof med === 'object' ? med : { name: String(med) }
        return {
          ...(normalized as Record<string, unknown>),
          added_date: f.created_at,
          appointment_id: f.appointment_id,
        }
      })
    })

  let pharmacy: Record<string, unknown> | null = null
  const encounterWithPharmacy = [...(encounters ?? [])]
    .filter((e) => e.pharmacy_id != null)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0]

  if (encounterWithPharmacy?.pharmacy_id) {
    const { data: pharmacyData, error: pharmacyError } = await admin
      .from('pharmacy')
      .select('id, name, address, city, state, zip_code, phone, phone_number, email, is_active')
      .eq('id', encounterWithPharmacy.pharmacy_id)
      .maybeSingle()
    if (pharmacyError) throw pharmacyError
    pharmacy = (pharmacyData as Record<string, unknown> | null) ?? null
  }

  return {
    medical_history: aggregatedHistory,
    medications,
    pharmacy,
  }
}
