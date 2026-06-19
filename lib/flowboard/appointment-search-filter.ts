import { matchDob } from '@/components/SearchByDobDropdowns'
import { parseSearchDateToIso } from '@/lib/nurse/patient-search-query'

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

export function appointmentMatchesSearchQuery(
  appointment: FlowboardAppointmentSearch,
  searchQuery: string,
  options?: { includeProvider?: boolean }
): boolean {
  const query = searchQuery.trim()
  if (!query) return true

  const q = query.toLowerCase()
  const patient = appointment.patient

  if (
    appointment.patient_id.toString().includes(q) ||
    (patient?.first_name ?? '').toLowerCase().includes(q) ||
    (patient?.last_name ?? '').toLowerCase().includes(q) ||
    (patient?.email ?? '').toLowerCase().includes(q) ||
    (patient?.phone ?? '').includes(q) ||
    (options?.includeProvider &&
      (appointment.assigned_doctor?.full_name ?? '').toLowerCase().includes(q))
  ) {
    return true
  }

  const parsedIso = parseSearchDateToIso(query)
  if (parsedIso) {
    const [y, m, d] = parsedIso.split('-')
    return matchDob(patient?.date_of_birth, y, m, d)
  }

  return false
}

export function appointmentMatchesDobFilters(
  appointment: FlowboardAppointmentSearch,
  dobYear: string,
  dobMonth: string,
  dobDay: string
): boolean {
  if (!dobYear && !dobMonth && !dobDay) return true
  return matchDob(appointment.patient?.date_of_birth, dobYear, dobMonth, dobDay)
}

export function hasActiveFlowboardDobFilters(
  dobYear: string,
  dobMonth: string,
  dobDay: string
): boolean {
  return !!(dobYear || dobMonth || dobDay)
}
