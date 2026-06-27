import {
  buildPatientDobFilter,
  parseSearchDateParts,
  parseSearchDateToIso,
  resolveMonthToken,
} from '@/lib/nurse/patient-search-query'
import {
  patientDobMatchesFilter,
  patientDobMatchesSearchParts,
} from '@/lib/nurse/patient-dob-match'
import { patientMatchesParsedSearch, patientMatchesFreeText } from '@/lib/nurse/patient-search-apply'
import { parsePatientSearchLocally } from '@/lib/nurse/patient-search-local'
import { emptyParsedPatientSearch } from '@/lib/nurse/patient-search-types'

describe('patient search date parsing', () => {
  it('parses DD/month-name/YYYY', () => {
    expect(parseSearchDateToIso('13/june/2026')).toBe('2026-06-13')
    expect(parseSearchDateToIso('13/June/2026')).toBe('2026-06-13')
    expect(parseSearchDateToIso('13 / june / 2026')).toBe('2026-06-13')
    expect(parseSearchDateToIso('13-june-2026')).toBe('2026-06-13')
  })

  it('parses month-name/DD/YYYY', () => {
    expect(parseSearchDateToIso('june/13/2026')).toBe('2026-06-13')
  })

  it('parses spaced month-name formats', () => {
    expect(parseSearchDateToIso('13 june 2026')).toBe('2026-06-13')
    expect(parseSearchDateToIso('june 13, 2026')).toBe('2026-06-13')
  })

  it('builds DOB filter from month names', () => {
    expect(buildPatientDobFilter('2026', 'june', '13')).toEqual({ eq: '2026-06-13' })
  })

  it('resolves Spanish month names', () => {
    expect(resolveMonthToken('junio')).toBe('06')
    expect(parseSearchDateToIso('13/junio/1993')).toBe('1993-06-13')
  })

  it('still parses numeric slash dates', () => {
    expect(parseSearchDateParts('6/08/1993')).toEqual({
      year: '1993',
      month: '06',
      day: '08',
    })
  })

  it('parses ISO compact YYYYMMDD', () => {
    expect(parseSearchDateToIso('19930608')).toBe('1993-06-08')
  })

  it('parses year-only DOB into a range filter', () => {
    expect(buildPatientDobFilter('1993')).toEqual({ gte: '1993-01-01', lte: '1993-12-31' })
  })
})

describe('patient dob filter matching', () => {
  it('matches year-only ranges', () => {
    const filter = buildPatientDobFilter('1993')
    expect(patientDobMatchesFilter('1993-06-08', filter)).toBe(true)
    expect(patientDobMatchesFilter('1992-06-08', filter)).toBe(false)
  })

  it('matches month/year ranges without requiring day 01 only', () => {
    const filter = buildPatientDobFilter('1993', '06')
    expect(patientDobMatchesFilter('1993-06-08', filter)).toBe(true)
    expect(patientDobMatchesFilter('1993-07-01', filter)).toBe(false)
  })
})

describe('patient search local parser', () => {
  it('parses person names into first and last', () => {
    const parsed = parsePatientSearchLocally('Maria Garcia')
    expect(parsed.firstName).toBe('Maria')
    expect(parsed.lastName).toBe('Garcia')
  })

  it('parses DOB before treating compact numbers as phone', () => {
    const parsed = parsePatientSearchLocally('06081993')
    expect(parsed.dobFilter?.eq).toBe('1993-06-08')
  })
})

describe('patient search matching', () => {
  const patient = {
    id: 42,
    first_name: 'Maria',
    last_name: 'Garcia',
    email: 'maria@example.com',
    phone: '(713) 555-0100',
    date_of_birth: '1993-06-08',
  }

  it('matches DOB in many formats', () => {
    expect(patientMatchesFreeText(patient, '6/8/1993')).toBe(true)
    expect(patientMatchesFreeText(patient, '1993')).toBe(true)
    expect(patientMatchesFreeText(patient, '06081993')).toBe(true)
    expect(patientMatchesFreeText(patient, '1993-06-08')).toBe(true)
  })

  it('matches split names and phone digits', () => {
    expect(patientMatchesFreeText(patient, 'Maria Garcia')).toBe(true)
    expect(patientMatchesFreeText(patient, '7135550100')).toBe(true)
    expect(patientMatchesParsedSearch(patient, parsePatientSearchLocally('maria@example.com'))).toBe(true)
  })

  it('matches parsed year-only DOB on client filter', () => {
    const parsed = parsePatientSearchLocally('1993')
    expect(patientMatchesParsedSearch(patient, parsed)).toBe(true)
    expect(patientMatchesParsedSearch(patient, emptyParsedPatientSearch(''))).toBe(true)
  })

  it('uses search parts helper for flowboard-style DOB matching', () => {
    const parts = parseSearchDateParts('1993')!
    expect(patientDobMatchesSearchParts(patient.date_of_birth, parts)).toBe(true)
  })
})
