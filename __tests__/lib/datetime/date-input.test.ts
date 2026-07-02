import {
  ageFromCalendarDate,
  formatCalendarDate,
  formatDobShort,
  parseCalendarDate,
} from '@/lib/datetime/date-input'

describe('parseCalendarDate', () => {
  test('parses YYYY-MM-DD at local noon without UTC day shift', () => {
    const date = parseCalendarDate('1984-06-04')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(1984)
    expect(date!.getMonth()).toBe(5)
    expect(date!.getDate()).toBe(4)
  })
})

describe('formatCalendarDate', () => {
  test('formats June 4 in Spanish without shifting to June 3', () => {
    const formatted = formatCalendarDate('1984-06-04', 'es-ES', { month: 'long' })
    expect(formatted).toContain('4')
    expect(formatted).not.toContain('3 de junio')
    expect(formatted.toLowerCase()).toMatch(/junio/)
  })

  test('formatDobShort returns MM/DD/YYYY style', () => {
    expect(formatDobShort('1984-06-04')).toBe('06/04/1984')
  })
})

describe('ageFromCalendarDate', () => {
  test('computes age from calendar DOB', () => {
    const today = new Date()
    const birthYear = today.getFullYear() - 30
    const dob = `${birthYear}-01-15`
    expect(ageFromCalendarDate(dob)).toBe(30)
  })
})
