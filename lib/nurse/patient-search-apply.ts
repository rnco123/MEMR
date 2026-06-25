import { matchDob } from '@/components/SearchByDobDropdowns'
import { sanitizePatientSearchTerm } from '@/lib/nurse/patient-search-query'
import type { ParsedPatientSearch } from '@/lib/nurse/patient-search-types'

type PatientLike = {
  id?: number
  patient_id?: number
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  date_of_birth?: string | null
}

type AppointmentLike = {
  patient_id: number
  patient?: PatientLike | null
  assigned_doctor?: { full_name?: string | null } | null
}

function dobPartsFromFilter(filter: NonNullable<ParsedPatientSearch['dobFilter']>): {
  year: string
  month: string
  day: string
} {
  if (filter.eq) {
    const [year, month, day] = filter.eq.split('-')
    return { year: year ?? '', month: month ?? '', day: day ?? '' }
  }
  if (filter.gte) {
    const [year, month, day] = filter.gte.split('-')
    return { year: year ?? '', month: month ?? '', day: day ?? '' }
  }
  return { year: '', month: '', day: '' }
}

export function patientMatchesParsedSearch(
  patient: PatientLike,
  parsed: ParsedPatientSearch
): boolean {
  if (!parsed.raw.trim()) return true

  if (parsed.dobFilter) {
    const parts = dobPartsFromFilter(parsed.dobFilter)
    return matchDob(patient.date_of_birth, parts.year, parts.month, parts.day)
  }

  const patientId = patient.id ?? patient.patient_id
  if (parsed.patientId != null && patientId != null) {
    return patientId === parsed.patientId
  }

  if (parsed.email) {
    return (patient.email ?? '').toLowerCase().includes(parsed.email.toLowerCase())
  }

  if (parsed.phone) {
    const needle = parsed.phone.replace(/\D/g, '')
    const hay = (patient.phone ?? '').replace(/\D/g, '')
    return hay.includes(needle)
  }

  if (parsed.firstName || parsed.lastName) {
    const first = (patient.first_name ?? '').toLowerCase()
    const last = (patient.last_name ?? '').toLowerCase()
    const firstOk = parsed.firstName ? first.includes(parsed.firstName.toLowerCase()) : true
    const lastOk = parsed.lastName ? last.includes(parsed.lastName.toLowerCase()) : true
    return firstOk && lastOk
  }

  const text = parsed.textQuery ?? sanitizePatientSearchTerm(parsed.raw)
  if (!text) return true

  const q = text.toLowerCase()
  return (
    String(patientId ?? '').includes(q) ||
    (patient.first_name ?? '').toLowerCase().includes(q) ||
    (patient.last_name ?? '').toLowerCase().includes(q) ||
    (patient.email ?? '').toLowerCase().includes(q) ||
    (patient.phone ?? '').includes(q)
  )
}

export function appointmentMatchesParsedSearch(
  appointment: AppointmentLike,
  parsed: ParsedPatientSearch,
  options?: { includeProvider?: boolean }
): boolean {
  if (!parsed.raw.trim()) return true

  if (
    parsed.providerName &&
    options?.includeProvider &&
    (appointment.assigned_doctor?.full_name ?? '').toLowerCase().includes(parsed.providerName.toLowerCase())
  ) {
    return true
  }

  return patientMatchesParsedSearch(
    {
      id: appointment.patient_id,
      ...appointment.patient,
    },
    parsed
  )
}

type FilterableQuery<T = FilterableQuery<unknown>> = {
  eq: (column: string, value: unknown) => T
  gte: (column: string, value: unknown) => T
  lte: (column: string, value: unknown) => T
  ilike: (column: string, pattern: string) => T
  or: (filters: string) => T
}

export function applyParsedPatientSearchToQuery<T extends FilterableQuery<T>>(
  query: T,
  parsed: ParsedPatientSearch
): T {
  if (!parsed.raw.trim()) return query

  if (parsed.dobFilter?.eq) {
    return query.eq('date_of_birth', parsed.dobFilter.eq)
  }
  if (parsed.dobFilter?.gte && parsed.dobFilter.lte) {
    return query
      .gte('date_of_birth', parsed.dobFilter.gte)
      .lte('date_of_birth', parsed.dobFilter.lte)
  }

  if (parsed.patientId != null) {
    return query.eq('id', parsed.patientId)
  }

  let next = query

  if (parsed.firstName) {
    next = next.ilike('first_name', `%${sanitizePatientSearchTerm(parsed.firstName)}%`)
  }
  if (parsed.lastName) {
    next = next.ilike('last_name', `%${sanitizePatientSearchTerm(parsed.lastName)}%`)
  }
  if (parsed.email) {
    next = next.ilike('email', `%${sanitizePatientSearchTerm(parsed.email)}%`)
  }
  if (parsed.phone) {
    next = next.ilike('phone', `%${sanitizePatientSearchTerm(parsed.phone)}%`)
  }

  const hasStructured =
    parsed.firstName || parsed.lastName || parsed.email || parsed.phone
  const text = parsed.textQuery ?? sanitizePatientSearchTerm(parsed.raw)

  if (!hasStructured && text) {
    const term = `%${text}%`
    const num = parseInt(text, 10)
    if (!Number.isNaN(num) && String(num) === text) {
      next = next.or(
        `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term},id.eq.${num}`
      )
    } else {
      next = next.or(
        `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`
      )
    }
  }

  return next
}
