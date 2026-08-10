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

export function appointmentMatchesParsedPatientSearch(
  appointment: FlowboardAppointmentSearch,
  parsed: ParsedPatientSearch | null,
  options?: { includeProvider?: boolean }
): boolean {
  if (!parsed?.raw.trim()) return true
  return appointmentMatchesParsedSearch(appointment, parsed, options)
}

export { patientMatchesParsedSearch }
