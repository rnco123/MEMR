export type SoapSection = 'subjective' | 'objective' | 'assessment' | 'plan'

/** Strip leading "**Subjective:**" style labels from AI-generated SOAP text. */
export function cleanSoapSection(text: string | null | undefined, section: SoapSection): string {
  if (!text) return ''

  const pattern = new RegExp(
    String.raw`^\s*(\*\*)?\s*${section}\s*:?\s*(\*\*)?\s*`,
    'i'
  )

  return text.replace(pattern, '').trim()
}
