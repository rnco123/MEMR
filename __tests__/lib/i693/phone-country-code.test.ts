/**
 * Applicant phone fields auto-carry the US country code (+1) on the I-693 form.
 */

import { formatI693WidgetValue, withUsCountryCode } from '@/lib/i693/pdf-field-formatters'

describe('withUsCountryCode', () => {
  it('prepends +1 to a bare 10-digit number', () => {
    expect(withUsCountryCode('8174954278')).toBe('+1 8174954278')
  })

  it('strips a leading 1 and normalizes an 11-digit number', () => {
    expect(withUsCountryCode('18174954278')).toBe('+1 8174954278')
  })

  it('normalizes formatted input to +1 + digits', () => {
    expect(withUsCountryCode('(817) 495-4278')).toBe('+1 8174954278')
  })

  it('is idempotent — already has +1', () => {
    expect(withUsCountryCode('+1 8174954278')).toBe('+1 8174954278')
  })

  it('leaves other country codes untouched', () => {
    expect(withUsCountryCode('+44 20 7946 0958')).toBe('+44 20 7946 0958')
  })

  it('leaves a partial entry as typed (no premature +1)', () => {
    expect(withUsCountryCode('817495')).toBe('817495')
  })

  it('returns empty for blank', () => {
    expect(withUsCountryCode('   ')).toBe('')
  })
})

describe('formatI693WidgetValue — applicant phones', () => {
  it('applies +1 to daytime and mobile phone keys', () => {
    expect(formatI693WidgetValue('applicant_contact.day_phone', '8174954278')).toBe('+1 8174954278')
    expect(formatI693WidgetValue('applicant_contact.mobile_phone', '8174954278')).toBe('+1 8174954278')
  })

  it('does not touch non-phone fields', () => {
    expect(formatI693WidgetValue('applicant.city', '8174954278')).toBe('8174954278')
  })
})
