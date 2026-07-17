import { ValidationError } from '@/lib/api-error-handler'

export function parseDiagnosisId(value: string | number | undefined, label: string): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError(`Invalid ${label}`)
  return id
}

export function normalizeDiagnosisSearch(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length > 100) throw new ValidationError('Diagnosis search is too long')
  if (trimmed.length < 2) return null

  const normalized = trimmed
    .replace(/[^a-zA-Z0-9.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.length >= 2 ? normalized : null
}

export function assertDiagnosisEncounterEditable(status: string | null | undefined): void {
  if (status === 'completed') {
    throw new ValidationError('Diagnoses cannot be changed after the encounter is completed')
  }
}

export function includesDiagnosisId(
  rows: Array<{ diagnosis_id: number | string }>,
  diagnosisId: number
): boolean {
  return rows.some((row) => Number(row.diagnosis_id) === diagnosisId)
}
