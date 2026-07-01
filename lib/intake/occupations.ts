/** Canonical occupation lookup — matches public.occupation (MCM-CSA / intake_form FK). */
export const INTAKE_OCCUPATIONS = [
  { id: 1, name: 'Teacher' },
  { id: 2, name: 'Doctor' },
  { id: 3, name: 'Nurse' },
  { id: 4, name: 'Engineer' },
  { id: 5, name: 'Lawyer' },
  { id: 6, name: 'Accountant' },
  { id: 7, name: 'Farmer' },
  { id: 8, name: 'Driver' },
  { id: 9, name: 'Police Officer' },
  { id: 10, name: 'Software Developer' },
  { id: 11, name: 'Businessman' },
  { id: 12, name: 'Shopkeeper' },
  { id: 13, name: 'Electrician' },
  { id: 14, name: 'Plumber' },
  { id: 15, name: 'Mechanic' },
  { id: 16, name: 'Other' },
] as const

export function occupationNameById(id: number | null | undefined): string | null {
  if (id == null || !Number.isFinite(id)) return null
  return INTAKE_OCCUPATIONS.find((o) => o.id === id)?.name ?? null
}
