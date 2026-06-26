import { isConsentFormHtmlEmpty } from '@/lib/forms/consent-placeholders'

describe('isConsentFormHtmlEmpty', () => {
  it('treats blank and empty paragraphs as empty', () => {
    expect(isConsentFormHtmlEmpty('')).toBe(true)
    expect(isConsentFormHtmlEmpty('   ')).toBe(true)
    expect(isConsentFormHtmlEmpty('<p></p>')).toBe(true)
    expect(isConsentFormHtmlEmpty('<p><br></p>')).toBe(true)
  })

  it('treats content with placeholders as non-empty', () => {
    const html =
      '<p><strong>Patient Signature:</strong> {{PATIENT_SIGNATURE}}</p><p><strong>Date:</strong> {{DATE}}</p>'
    expect(isConsentFormHtmlEmpty(html)).toBe(false)
  })
})
