import { buildPatientDobFilter, type SearchDateParts } from '@/lib/nurse/patient-search-query'
import type { PatientSearchDobFilter } from '@/lib/nurse/patient-search-types'

/** Match stored ISO DOB (YYYY-MM-DD) against year / month / day parts (empty = any). */
export function matchDobParts(
  dateOfBirth: string | null | undefined,
  year: string,
  month = '',
  day = ''
): boolean {
  if (!dateOfBirth) return false
  const [y, m, d] = dateOfBirth.split('-')
  if (!y) return false
  if (year && y !== year) return false
  if (month && m !== month.padStart(2, '0')) return false
  if (day && d !== day.padStart(2, '0')) return false
  return true
}

export function patientDobMatchesFilter(
  dateOfBirth: string | null | undefined,
  filter: PatientSearchDobFilter | null | undefined
): boolean {
  if (!dateOfBirth || !filter) return false
  if (filter.eq) return dateOfBirth === filter.eq
  if (filter.gte && filter.lte) {
    return dateOfBirth >= filter.gte && dateOfBirth <= filter.lte
  }
  return false
}

export function patientDobMatchesSearchParts(
  dateOfBirth: string | null | undefined,
  parts: SearchDateParts
): boolean {
  const filter = buildPatientDobFilter(parts.year, parts.month ?? '', parts.day ?? '')
  return patientDobMatchesFilter(dateOfBirth, filter)
}

/** Common display formats for matching free-text DOB queries. */
export function dobDisplayVariants(dateOfBirth: string | null | undefined): string[] {
  if (!dateOfBirth) return []
  const [y, m, d] = dateOfBirth.split('-')
  if (!y || !m || !d) return [dateOfBirth]
  const monthNum = String(Number(m))
  const dayNum = String(Number(d))
  return [
    dateOfBirth,
    `${m}-${d}-${y}`,
    `${m}/${d}/${y}`,
    `${monthNum}/${dayNum}/${y}`,
    `${monthNum}-${dayNum}-${y}`,
    `${monthNum}.${dayNum}.${y}`,
    `${d}/${m}/${y}`,
    `${dayNum}/${monthNum}/${y}`,
    `${m}${d}${y}`,
    `${y}${m}${d}`,
    `${monthNum}${dayNum}${y}`,
  ]
}
