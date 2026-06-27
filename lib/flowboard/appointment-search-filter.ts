import { patientDobMatchesSearchParts } from '@/lib/nurse/patient-dob-match'
import { parseSearchDateParts } from '@/lib/nurse/patient-search-query'
import {
  appointmentMatchesParsedSearch,
  patientMatchesFreeText,
  patientMatchesParsedSearch,
} from '@/lib/nurse/patient-search-apply'
import type { ParsedPatientSearch } from '@/lib/nurse/patient-search-types'

export type FlowboardAppointmentSearch = {
  patient_id: number
  patient?: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    phone?: string | null
    date_of_birth?: string | null
  } | null
  assigned_doctor?: { full_name?: string | null } | null
}

/** Legacy raw-string matcher (local date parse only). Prefer parsed OpenAI search. */
export function appointmentMatchesSearchQuery(
  appointment: FlowboardAppointmentSearch,
  searchQuery: string,
  options?: { includeProvider?: boolean }
): boolean {
  const query = searchQuery.trim()
  if (!query) return true

  const dateParts = parseSearchDateParts(query)
  if (dateParts) {
    if (patientDobMatchesSearchParts(appointment.patient?.date_of_birth, dateParts)) return true
    if (dateParts.year) return false
  }

  const patientMatch = patientMatchesFreeText(
    {
      id: appointment.patient_id,
      ...appointment.patient,
    },
    query
  )
  if (patientMatch) return true

  if (options?.includeProvider) {
    return (appointment.assigned_doctor?.full_name ?? '').toLowerCase().includes(query.toLowerCase())
  }
  return false
}

export function appointmentMatchesParsedPatientSearch(
  appointment: FlowboardAppointmentSearch,
  parsed: ParsedPatientSearch | null,
  options?: { includeProvider?: boolean }
): boolean {
  if (!parsed?.raw.trim()) return true
  return appointmentMatchesParsedSearch(appointment, parsed, options)
}

export { patientMatchesParsedSearch }
