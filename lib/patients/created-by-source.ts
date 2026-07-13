/** How a patient chart was created in MEMR. */
export type PatientCreatedBySource = 'QR' | 'Direct'

export const PATIENT_CREATED_BY_SOURCES = ['QR', 'Direct'] as const satisfies readonly PatientCreatedBySource[]

export function isPatientCreatedBySource(value: unknown): value is PatientCreatedBySource {
  return value === 'QR' || value === 'Direct'
}

export function normalizePatientCreatedBySource(value: unknown): PatientCreatedBySource {
  return isPatientCreatedBySource(value) ? value : 'QR'
}
