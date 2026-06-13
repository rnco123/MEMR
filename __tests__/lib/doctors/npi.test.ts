import { parseDoctorNpi } from '@/lib/doctors/npi'

describe('parseDoctorNpi', () => {
  it('returns null for empty input', () => {
    expect(parseDoctorNpi(null)).toBeNull()
    expect(parseDoctorNpi('')).toBeNull()
    expect(parseDoctorNpi('   ')).toBeNull()
  })

  it('normalizes 10-digit NPI', () => {
    expect(parseDoctorNpi('1234567890')).toBe('1234567890')
    expect(parseDoctorNpi('123-456-7890')).toBe('1234567890')
  })

  it('rejects invalid length', () => {
    expect(() => parseDoctorNpi('12345')).toThrow('10 digits')
  })
})
