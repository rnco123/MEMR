import { matchDob } from '@/components/SearchByDobDropdowns'
import { parseSearchDateParts } from '@/lib/nurse/patient-search-query'
import {
  appointmentMatchesParsedSearch,
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
    return matchDob(
      appointment.patient?.date_of_birth,
      dateParts.year,
      dateParts.month ?? '',
      dateParts.day ?? ''
    )
  }

  const q = query.toLowerCase()
  const patient = appointment.patient

  return (
    appointment.patient_id.toString().includes(q) ||
    (patient?.first_name ?? '').toLowerCase().includes(q) ||
    (patient?.last_name ?? '').toLowerCase().includes(q) ||
    (patient?.email ?? '').toLowerCase().includes(q) ||
    (patient?.phone ?? '').includes(q) ||
    (Boolean(options?.includeProvider) &&
      (appointment.assigned_doctor?.full_name ?? '').toLowerCase().includes(q))
  )
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
