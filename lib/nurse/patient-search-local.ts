import {
  buildPatientDobFilter,
  parseSearchDateParts,
  sanitizePatientSearchTerm,
} from '@/lib/nurse/patient-search-query'
import {
  emptyParsedPatientSearch,
  type ParsedPatientSearch,
} from '@/lib/nurse/patient-search-types'

type LocalParseInput = {
  search_intent:
    | 'date_of_birth'
    | 'patient_id'
    | 'person_name'
    | 'email'
    | 'phone'
    | 'provider'
    | 'general'
  patient_id: number | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  dob_year: string | null
  dob_month: string | null
  dob_day: string | null
  provider_name: string | null
  general_query: string | null
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function looksLikePhoneInput(trimmed: string): boolean {
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 11) return false
  if (parseSearchDateParts(trimmed)) return false
  return /[\s().+-]/.test(trimmed) || digits.length >= 10
}

function parsePersonName(trimmed: string): { first: string; last: string } | null {
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length < 2 || parts.length > 4) return null
  if (!parts.every((part) => /^[\p{L}'-]+$/u.test(part))) return null
  return {
    first: parts[0]!,
    last: parts.slice(1).join(' '),
  }
}

export function parsedPatientSearchFromFields(
  raw: string,
  output: LocalParseInput,
  source: 'openai' | 'local',
  includeProvider: boolean
): ParsedPatientSearch {
  const dobFilter = buildPatientDobFilter(
    normalizeNullableString(output.dob_year) ?? '',
    normalizeNullableString(output.dob_month) ?? '',
    normalizeNullableString(output.dob_day) ?? ''
  )

  const firstName = normalizeNullableString(output.first_name)
  const lastName = normalizeNullableString(output.last_name)
  const email = normalizeNullableString(output.email)
  const phone = normalizeNullableString(output.phone)
  const providerName =
    includeProvider && output.search_intent === 'provider'
      ? normalizeNullableString(output.provider_name)
      : null

  let patientId = output.patient_id ?? null
  if (output.search_intent === 'patient_id' && patientId == null) {
    const n = Number(raw.trim())
    if (Number.isInteger(n) && n > 0) patientId = n
  }

  let textQuery: string | null = null
  if (output.search_intent === 'general') {
    textQuery = sanitizePatientSearchTerm(normalizeNullableString(output.general_query) ?? raw)
  } else if (
    !dobFilter &&
    patientId == null &&
    !firstName &&
    !lastName &&
    !email &&
    !phone &&
    !providerName
  ) {
    textQuery = sanitizePatientSearchTerm(raw)
  }

  return {
    source,
    raw,
    dobFilter,
    patientId,
    firstName,
    lastName,
    email,
    phone,
    providerName,
    textQuery,
  }
}

/** Regex/heuristic parser — safe for client-side fallback. */
export function parsePatientSearchLocally(
  raw: string,
  options: { includeProvider?: boolean } = {}
): ParsedPatientSearch {
  const trimmed = raw.trim()
  if (!trimmed) return emptyParsedPatientSearch(trimmed)

  const includeProvider = Boolean(options.includeProvider)

  const dateParts = parseSearchDateParts(trimmed)
  if (dateParts) {
    return parsedPatientSearchFromFields(
      trimmed,
      {
        search_intent: 'date_of_birth',
        patient_id: null,
        first_name: null,
        last_name: null,
        email: null,
        phone: null,
        dob_year: dateParts.year ?? null,
        dob_month: dateParts.month ?? null,
        dob_day: dateParts.day ?? null,
        provider_name: null,
        general_query: null,
      },
      'local',
      includeProvider
    )
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return parsedPatientSearchFromFields(
      trimmed,
      {
        search_intent: 'email',
        patient_id: null,
        first_name: null,
        last_name: null,
        email: trimmed,
        phone: null,
        dob_year: null,
        dob_month: null,
        dob_day: null,
        provider_name: null,
        general_query: null,
      },
      'local',
      includeProvider
    )
  }

  if (looksLikePhoneInput(trimmed)) {
    return parsedPatientSearchFromFields(
      trimmed,
      {
        search_intent: 'phone',
        patient_id: null,
        first_name: null,
        last_name: null,
        email: null,
        phone: trimmed,
        dob_year: null,
        dob_month: null,
        dob_day: null,
        provider_name: null,
        general_query: null,
      },
      'local',
      includeProvider
    )
  }

  const asInt = Number(trimmed)
  if (Number.isInteger(asInt) && asInt > 0 && /^\d+$/.test(trimmed) && !/^0/.test(trimmed)) {
    return parsedPatientSearchFromFields(
      trimmed,
      {
        search_intent: 'patient_id',
        patient_id: asInt,
        first_name: null,
        last_name: null,
        email: null,
        phone: null,
        dob_year: null,
        dob_month: null,
        dob_day: null,
        provider_name: null,
        general_query: null,
      },
      'local',
      includeProvider
    )
  }

  const personName = parsePersonName(trimmed)
  if (personName) {
    return parsedPatientSearchFromFields(
      trimmed,
      {
        search_intent: 'person_name',
        patient_id: null,
        first_name: personName.first,
        last_name: personName.last,
        email: null,
        phone: null,
        dob_year: null,
        dob_month: null,
        dob_day: null,
        provider_name: null,
        general_query: null,
      },
      'local',
      includeProvider
    )
  }

  return parsedPatientSearchFromFields(
    trimmed,
    {
      search_intent: 'general',
      patient_id: null,
      first_name: null,
      last_name: null,
      email: null,
      phone: null,
      dob_year: null,
      dob_month: null,
      dob_day: null,
      provider_name: null,
      general_query: trimmed,
    },
    'local',
    includeProvider
  )
}

export type { LocalParseInput as PatientSearchToolInput }
