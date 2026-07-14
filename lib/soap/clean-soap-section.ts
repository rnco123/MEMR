export type SoapSection = 'subjective' | 'objective' | 'assessment' | 'plan'

/**
 * Turn leftover JSON-array snippets (`["Rest"]`, `["no", "Yes"]`) into
 * plain CSV text so SOAP notes read normally when intake stored lists as JSON.
 */
export function normalizeJsonListSnippets(text: string): string {
  return text.replace(/\[[\s\S]*?\]/g, (match) => {
    try {
      const parsed = JSON.parse(match) as unknown
      if (!Array.isArray(parsed)) return match
      return parsed
        .map((item) => {
          const value = String(item ?? '').trim()
          if (!value) return ''
          if (/^yes$/i.test(value)) return 'Yes'
          if (/^no$/i.test(value)) return 'No'
          return value
        })
        .filter(Boolean)
        .join(', ')
    } catch {
      return match
    }
  })
}

/** Strip leading "**Subjective:**" style labels from AI-generated SOAP text. */
export function cleanSoapSection(text: string | null | undefined, section: SoapSection): string {
  if (!text) return ''

  const pattern = new RegExp(
    String.raw`^\s*(\*\*)?\s*${section}\s*:?\s*(\*\*)?\s*`,
    'i'
  )

  return normalizeJsonListSnippets(text.replace(pattern, '').trim())
}
