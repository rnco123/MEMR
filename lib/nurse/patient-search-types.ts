export type PatientSearchDobFilter = {
  eq?: string
  gte?: string
  lte?: string
  /** Birth month (01–12) in any year. */
  anyYearMonth?: string
  /** Birth month+day in any year. */
  anyYearMonthDay?: { month: string; day: string }
}

export type ParsedPatientSearch = {
  source: 'local'
  raw: string
  dobFilter: PatientSearchDobFilter | null
  patientId: number | null
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  providerName: string | null
  /** Broad text match when intent is general or unstructured. */
  textQuery: string | null
}

export function emptyParsedPatientSearch(raw = ''): ParsedPatientSearch {
  return {
    source: 'local',
    raw,
    dobFilter: null,
    patientId: null,
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    providerName: null,
    textQuery: null,
  }
}
