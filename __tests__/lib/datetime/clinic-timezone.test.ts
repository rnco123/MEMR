import {
  CLINIC_TIME_ZONE,
  CLINIC_TIME_ZONE_LABEL,
  formatClinicChatTime,
  formatClinicDateTime,
  formatClinicTimeSlot,
  getClinicTodayDateString,
} from '@/lib/datetime/clinic-timezone'

describe('clinic-timezone', () => {
  test('formatClinicDateTime converts UTC to Central with CT suffix', () => {
    const formatted = formatClinicDateTime('2026-06-14T00:11:00.000Z', 'en-US')
    expect(formatted).toContain(CLINIC_TIME_ZONE_LABEL)
    expect(formatted).toMatch(/Jun 13, 2026.*7:11 PM/i)
  })

  test('formatClinicTimeSlot formats appointment slot with CT suffix', () => {
    expect(formatClinicTimeSlot('19:11:00')).toBe('7:11 PM CT')
    expect(formatClinicTimeSlot('09:05')).toBe('9:05 AM CT')
  })

  test('formatClinicChatTime uses Central day boundaries', () => {
    const formatted = formatClinicChatTime('2026-06-14T00:11:00.000Z', 'en')
    expect(formatted).toContain('CT')
  })

  test('exports America/Chicago timezone constant', () => {
    expect(CLINIC_TIME_ZONE).toBe('America/Chicago')
  })

  test('getClinicTodayDateString returns YYYY-MM-DD in Central time', () => {
    const formatted = getClinicTodayDateString(new Date('2026-06-25T06:00:00.000Z'))
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(formatted).toBe('2026-06-25')
  })
})
