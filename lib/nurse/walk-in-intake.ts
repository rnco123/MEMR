import type { NurseWalkInIntakeInput } from '@/lib/validation'

export type WalkInIntakeInput = NurseWalkInIntakeInput

function textToJsonList(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const parts = trimmed.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  return JSON.stringify(parts.length > 0 ? parts : [trimmed])
}

function yesNoToJson(value: 'yes' | 'no' | null | undefined): string | null {
  if (!value) return null
  return JSON.stringify([value === 'yes' ? 'Yes' : 'No'])
}

/** Returns intake_form row fields when any intake data is present; otherwise null. */
export function buildIntakeFormRow(
  intake: WalkInIntakeInput | undefined | null
): Record<string, unknown> | null {
  if (!intake) return null

  const row: Record<string, unknown> = {}

  if (intake.chief_complaint?.trim()) row.chief_complaint = intake.chief_complaint.trim()
  if (intake.onset?.trim()) row.onset = intake.onset.trim()
  if (intake.location?.trim()) row.location = intake.location.trim()
  if (intake.severity != null) row.severity = intake.severity
  if (intake.symptoms_description?.trim()) row.symptoms_description = intake.symptoms_description.trim()

  const meds = textToJsonList(intake.current_medications)
  if (meds) row.current_medications = meds

  const conditions = textToJsonList(intake.medical_conditions)
  if (conditions) row.medical_conditions = conditions

  const surgeries = yesNoToJson(intake.surgeries)
  if (surgeries) row.surgeries = surgeries

  const allergies = yesNoToJson(intake.allergies)
  if (allergies) row.allergies = allergies

  if (intake.relieving_factors?.length) {
    row.relieving_factors = JSON.stringify(intake.relieving_factors)
  }

  if (intake.fh_hypertension != null) row.fh_hypertension = intake.fh_hypertension
  if (intake.fh_diabetes != null) row.fh_diabetes = intake.fh_diabetes
  if (intake.fh_cancer != null) row.fh_cancer = intake.fh_cancer
  if (intake.fh_heart_disease != null) row.fh_heart_disease = intake.fh_heart_disease

  if (intake.tobacco_use != null) row.tobacco_use = intake.tobacco_use
  if (intake.alcohol_use != null) row.alcohol_use = intake.alcohol_use
  if (intake.drug_use != null) row.drug_use = intake.drug_use

  if (intake.occupation != null) row.occupation = intake.occupation

  return Object.keys(row).length > 0 ? row : null
}

export function calculateAgeFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null
  const d = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1
  return age >= 0 ? age : null
}
