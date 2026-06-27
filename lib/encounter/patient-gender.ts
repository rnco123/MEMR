export type PatientGenderValue = 'male' | 'female' | 'other'

/** Map legacy / mixed-case gender values to form + API values. */
export function normalizePatientGender(value: string | null | undefined): PatientGenderValue | null {
  const g = (value ?? '').trim().toLowerCase()
  if (!g) return null
  if (g === 'male' || g === 'm') return 'male'
  if (g === 'female' || g === 'f') return 'female'
  if (g === 'other' || g === 'others' || g === 'prefer_not_to_say' || g === 'prefer not to say') {
    return 'other'
  }
  return 'other'
}
