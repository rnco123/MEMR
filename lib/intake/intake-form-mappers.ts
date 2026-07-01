import type { NurseWalkInIntakeInput } from '@/lib/validation'

export const INTAKE_RELIEVING_OPTIONS = [
  'Rest',
  'Ice',
  'Heat',
  'Elevation',
  'Medication',
  'Stretching',
  'Massage',
  'Support or compression',
  'Time',
  'Other',
] as const

function parseJsonStringList(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) return parsed.map(String).join(', ')
    } catch {
      return trimmed
    }
    return trimmed
  }
  return String(value)
}

function parseYesNoField(value: unknown): 'yes' | 'no' | null {
  const list = parseJsonStringList(value).toLowerCase()
  if (!list) return null
  if (list.includes('yes')) return 'yes'
  if (list.includes('no')) return 'no'
  return null
}

function parseRelievingFactors(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      return value.trim() ? [value.trim()] : []
    }
  }
  return []
}

export function intakeRowToFormInput(row: Record<string, unknown> | null): NurseWalkInIntakeInput {
  if (!row) return {}

  return {
    chief_complaint: (row.chief_complaint as string | null) ?? null,
    onset: row.onset ? String(row.onset).slice(0, 10) : null,
    location: (row.location as string | null) ?? null,
    severity: row.severity != null ? Number(row.severity) : null,
    symptoms_description: (row.symptoms_description as string | null) ?? null,
    relieving_factors: parseRelievingFactors(row.relieving_factors),
    current_medications: parseJsonStringList(row.current_medications) || null,
    medical_conditions: parseJsonStringList(row.medical_conditions) || null,
    surgeries: parseYesNoField(row.surgeries),
    allergies: parseYesNoField(row.allergies),
    fh_hypertension: row.fh_hypertension === true,
    fh_diabetes: row.fh_diabetes === true,
    fh_cancer: row.fh_cancer === true,
    fh_heart_disease: row.fh_heart_disease === true,
    tobacco_use: row.tobacco_use === true,
    alcohol_use: row.alcohol_use === true,
    drug_use: row.drug_use === true,
    occupation:
      row.occupation != null && Number.isFinite(Number(row.occupation))
        ? Number(row.occupation)
        : null,
  }
}

export function emptyIntakeFormInput(): NurseWalkInIntakeInput {
  return {}
}
