import {
  buildPatientDobFilter,
  isPartialDobFilter,
  parseSearchDateParts,
  sanitizePatientSearchTerm,
} from '@/lib/nurse/patient-search-query'
import {
  dobDisplayVariants,
  patientDobMatchesFilter,
} from '@/lib/nurse/patient-dob-match'
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

function normalizePhoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

function patientFullName(patient: PatientLike): string {
  return `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim()
}

function patientMatchesNameText(patient: PatientLike, raw: string): boolean {
  const text = sanitizePatientSearchTerm(raw)
  if (!text) return true

  const q = text.toLowerCase()
  const patientId = patient.id ?? patient.patient_id
  const fullName = patientFullName(patient).toLowerCase()
  const haystack = [
    String(patientId ?? ''),
    (patient.first_name ?? '').toLowerCase(),
    (patient.last_name ?? '').toLowerCase(),
    fullName,
    (patient.email ?? '').toLowerCase(),
    patient.phone ?? '',
  ].join(' ')

  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) {
    return tokens.every((token) => haystack.includes(token))
  }

  return (
    String(patientId ?? '').includes(q) ||
    (patient.first_name ?? '').toLowerCase().includes(q) ||
    (patient.last_name ?? '').toLowerCase().includes(q) ||
    fullName.includes(q) ||
    (patient.email ?? '').toLowerCase().includes(q) ||
    (patient.phone ?? '').includes(q) ||
    haystack.includes(q)
  )
}

export function patientMatchesFreeText(patient: PatientLike, raw: string): boolean {
  const text = sanitizePatientSearchTerm(raw)
  if (!text) return true

  const dateParts = parseSearchDateParts(text)
  if (dateParts) {
    const filter = buildPatientDobFilter(
      dateParts.year ?? '',
      dateParts.month ?? '',
      dateParts.day ?? ''
    )
    if (filter && patientDobMatchesFilter(patient.date_of_birth, filter)) return true
    if (!dateParts.year) {
      if (patientMatchesNameText(patient, text)) return true
    } else if (dateParts.year && (dateParts.month || dateParts.day)) {
      return false
    }
  }

  const q = text.toLowerCase()
  const patientId = patient.id ?? patient.patient_id
  const fullName = patientFullName(patient).toLowerCase()
  const haystack = [
    String(patientId ?? ''),
    (patient.first_name ?? '').toLowerCase(),
    (patient.last_name ?? '').toLowerCase(),
    fullName,
    (patient.email ?? '').toLowerCase(),
    patient.phone ?? '',
    patient.date_of_birth ?? '',
    ...dobDisplayVariants(patient.date_of_birth).map((v) => v.toLowerCase()),
  ].join(' ')

  const queryDigits = normalizePhoneDigits(text)
  if (queryDigits.length >= 4) {
    const phoneDigits = normalizePhoneDigits(patient.phone)
    const dobDigits = normalizePhoneDigits(patient.date_of_birth)
    if (phoneDigits.includes(queryDigits) || dobDigits.includes(queryDigits)) return true
  }

  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) {
    return tokens.every((token) => haystack.includes(token))
  }

  return (
    String(patientId ?? '').includes(q) ||
    (patient.first_name ?? '').toLowerCase().includes(q) ||
    (patient.last_name ?? '').toLowerCase().includes(q) ||
    fullName.includes(q) ||
    (patient.email ?? '').toLowerCase().includes(q) ||
    (patient.phone ?? '').includes(q) ||
    haystack.includes(q)
  )
}

export function patientMatchesParsedSearch(
  patient: PatientLike,
  parsed: ParsedPatientSearch
): boolean {
  if (!parsed.raw.trim()) return true

  if (parsed.dobFilter) {
    if (patientDobMatchesFilter(patient.date_of_birth, parsed.dobFilter)) return true
    if (isPartialDobFilter(parsed.dobFilter)) {
      return patientMatchesNameText(patient, parsed.raw)
    }
    return false
  }

  const patientId = patient.id ?? patient.patient_id
  if (parsed.patientId != null && patientId != null) {
    return patientId === parsed.patientId
  }

  if (parsed.email) {
    return (patient.email ?? '').toLowerCase().includes(parsed.email.toLowerCase())
  }

  if (parsed.phone) {
    const needle = normalizePhoneDigits(parsed.phone)
    const hay = normalizePhoneDigits(patient.phone)
    return needle.length > 0 && hay.includes(needle)
  }

  if (parsed.firstName || parsed.lastName) {
    const first = (patient.first_name ?? '').toLowerCase()
    const last = (patient.last_name ?? '').toLowerCase()
    const full = patientFullName(patient).toLowerCase()
    const firstOk = parsed.firstName ? first.includes(parsed.firstName.toLowerCase()) : true
    const lastOk = parsed.lastName ? last.includes(parsed.lastName.toLowerCase()) : true
    if (firstOk && lastOk) return true
    const combined = `${parsed.firstName ?? ''} ${parsed.lastName ?? ''}`.trim().toLowerCase()
    if (combined && full.includes(combined)) return true
    return false
  }

  const text = parsed.textQuery ?? sanitizePatientSearchTerm(parsed.raw)
  return patientMatchesFreeText(patient, text)
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

function escapePostgrestFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,')
}

export function applyParsedPatientSearchToQuery<T extends FilterableQuery<T>>(
  query: T,
  parsed: ParsedPatientSearch
): T {
  if (!parsed.raw.trim()) return query

  if (parsed.dobFilter?.anyYearMonthDay) {
    const { month, day } = parsed.dobFilter.anyYearMonthDay
    const term = escapePostgrestFilterValue(sanitizePatientSearchTerm(parsed.raw))
    const ilikeTerm = `%${term}%`
    return query.or(
      `and(dob_month.eq.${Number(month)},dob_day.eq.${Number(day)}),first_name.ilike.${ilikeTerm},last_name.ilike.${ilikeTerm}`
    )
  }
  if (parsed.dobFilter?.anyYearMonth) {
    const m = parsed.dobFilter.anyYearMonth
    const term = escapePostgrestFilterValue(sanitizePatientSearchTerm(parsed.raw))
    const ilikeTerm = `%${term}%`
    return query.or(
      `dob_month.eq.${Number(m)},first_name.ilike.${ilikeTerm},last_name.ilike.${ilikeTerm}`
    )
  }

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
    next = next.ilike('first_name', `%${escapePostgrestFilterValue(sanitizePatientSearchTerm(parsed.firstName))}%`)
  }
  if (parsed.lastName) {
    next = next.ilike('last_name', `%${escapePostgrestFilterValue(sanitizePatientSearchTerm(parsed.lastName))}%`)
  }
  if (parsed.email) {
    next = next.ilike('email', `%${escapePostgrestFilterValue(sanitizePatientSearchTerm(parsed.email))}%`)
  }
  if (parsed.phone) {
    const digits = normalizePhoneDigits(parsed.phone)
    const needle = digits.length >= 7 ? digits.slice(-10) : sanitizePatientSearchTerm(parsed.phone)
    next = next.ilike('phone', `%${escapePostgrestFilterValue(needle)}%`)
  }

  const hasStructured =
    parsed.firstName || parsed.lastName || parsed.email || parsed.phone
  const text = parsed.textQuery ?? sanitizePatientSearchTerm(parsed.raw)

  if (!hasStructured && text) {
    const dateParts = parseSearchDateParts(text)
    if (dateParts) {
      const filter = buildPatientDobFilter(
        dateParts.year ?? '',
        dateParts.month ?? '',
        dateParts.day ?? ''
      )
      if (filter?.eq) return query.eq('date_of_birth', filter.eq)
      if (filter?.gte && filter.lte) {
        return query.gte('date_of_birth', filter.gte).lte('date_of_birth', filter.lte)
      }
      if (filter?.anyYearMonthDay) {
        const { month, day } = filter.anyYearMonthDay
        const term = escapePostgrestFilterValue(text)
        const ilikeTerm = `%${term}%`
        return query.or(
          `and(dob_month.eq.${Number(month)},dob_day.eq.${Number(day)}),first_name.ilike.${ilikeTerm},last_name.ilike.${ilikeTerm}`
        )
      }
      if (filter?.anyYearMonth) {
        const m = filter.anyYearMonth
        const term = escapePostgrestFilterValue(text)
        const ilikeTerm = `%${term}%`
        return query.or(
          `dob_month.eq.${Number(m)},first_name.ilike.${ilikeTerm},last_name.ilike.${ilikeTerm}`
        )
      }
    }

    const term = escapePostgrestFilterValue(text)
    const ilikeTerm = `%${term}%`
    const nameParts = text.split(/\s+/).filter(Boolean)

    if (nameParts.length >= 2) {
      const first = escapePostgrestFilterValue(nameParts[0]!)
      const last = escapePostgrestFilterValue(nameParts.slice(1).join(' '))
      next = next.or(
        `and(first_name.ilike.%${first}%,last_name.ilike.%${last}%),first_name.ilike.${ilikeTerm},last_name.ilike.${ilikeTerm},email.ilike.${ilikeTerm},phone.ilike.${ilikeTerm}`
      )
    } else {
      const num = parseInt(text, 10)
      if (!Number.isNaN(num) && String(num) === text) {
        next = next.or(
          `first_name.ilike.${ilikeTerm},last_name.ilike.${ilikeTerm},email.ilike.${ilikeTerm},phone.ilike.${ilikeTerm},id.eq.${num}`
        )
      } else {
        next = next.or(
          `first_name.ilike.${ilikeTerm},last_name.ilike.${ilikeTerm},email.ilike.${ilikeTerm},phone.ilike.${ilikeTerm}`
        )
      }
    }
  }

  return next
}
