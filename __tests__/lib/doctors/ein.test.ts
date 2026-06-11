import { parseDoctorEin } from '@/lib/doctors/ein'

describe('parseDoctorEin', () => {
  it('returns null for empty input', () => {
    expect(parseDoctorEin(null)).toBeNull()
    expect(parseDoctorEin('')).toBeNull()
    expect(parseDoctorEin('   ')).toBeNull()
  })

  it('normalizes 9-digit EIN to XX-XXXXXXX', () => {
    expect(parseDoctorEin('123456789')).toBe('12-3456789')
    expect(parseDoctorEin('12-3456789')).toBe('12-3456789')
  })

  it('rejects invalid length', () => {
    expect(() => parseDoctorEin('12345')).toThrow('9 digits')
  })
})
