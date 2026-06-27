import { toDateInputValue, todayLocalIsoDate } from '@/lib/datetime/date-input'
import { normalizePatientGender } from '@/lib/encounter/patient-gender'

describe('patient gender normalization', () => {
  it('maps legacy capitalized values', () => {
    expect(normalizePatientGender('Male')).toBe('male')
    expect(normalizePatientGender('Female')).toBe('female')
  })

  it('maps empty to null', () => {
    expect(normalizePatientGender(null)).toBeNull()
    expect(normalizePatientGender('')).toBeNull()
  })
})

describe('date input helpers', () => {
  it('normalizes ISO timestamps to YYYY-MM-DD', () => {
    expect(toDateInputValue('1993-06-08T00:00:00.000Z')).toBe('1993-06-08')
  })

  it('normalizes slash dates', () => {
    expect(toDateInputValue('6/8/1993')).toBe('1993-06-08')
  })

  it('returns today in local ISO format', () => {
    expect(todayLocalIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
