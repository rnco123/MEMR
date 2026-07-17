import {
  isPatientCreatedBySource,
  normalizePatientCreatedBySource,
} from '@/lib/patients/created-by-source'
import {
  normalizePhoneForStorage,
  phoneMatchDigits,
} from '@/lib/patients/phone-normalize'

describe('patient created_by_source', () => {
  it('accepts QR and Direct only', () => {
    expect(isPatientCreatedBySource('QR')).toBe(true)
    expect(isPatientCreatedBySource('Direct')).toBe(true)
    expect(isPatientCreatedBySource('legacy')).toBe(false)
    expect(normalizePatientCreatedBySource(null)).toBe('QR')
    expect(normalizePatientCreatedBySource('Direct')).toBe('Direct')
  })
})

describe('patient phone normalize', () => {
  it('matches 10-digit US phones across formats', () => {
    expect(phoneMatchDigits('+15551234567')).toBe('5551234567')
    expect(phoneMatchDigits('(555) 123-4567')).toBe('5551234567')
    expect(normalizePhoneForStorage('5551234567')).toBe('+15551234567')
  })
})
