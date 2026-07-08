/**
 * Applicant phone fields are stored and exported exactly as entered (no forced +1).
 */

import { formatI693WidgetValue } from '@/lib/i693/pdf-field-formatters'

describe('formatI693WidgetValue — applicant phones', () => {
  it('keeps daytime and mobile phone values as entered', () => {
    expect(formatI693WidgetValue('applicant_contact.day_phone', '7135550284')).toBe('7135550284')
    expect(formatI693WidgetValue('applicant_contact.day_phone', '+1 7135550284')).toBe('+1 7135550284')
    expect(formatI693WidgetValue('applicant_contact.mobile_phone', '(713) 555-0284')).toBe('(713) 555-0284')
  })

  it('does not touch non-phone fields', () => {
    expect(formatI693WidgetValue('applicant.city', '8174954278')).toBe('8174954278')
  })
})
