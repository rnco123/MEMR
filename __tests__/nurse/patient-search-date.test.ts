import {
  buildPatientDobFilter,
  parseSearchDateParts,
  parseSearchDateToIso,
  resolveMonthToken,
} from '@/lib/nurse/patient-search-query'

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
})
