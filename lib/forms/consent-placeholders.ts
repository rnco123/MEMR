/** Dynamic tokens replaced at render time — see lib/forms/render-consent-html.ts */
export const CONSENT_FORM_PLACEHOLDERS = [
  { token: '{{PATIENT_NAME}}', labelKey: 'admin.forms.field_patient_name' },
  { token: '{{DATE}}', labelKey: 'admin.forms.field_date' },
  { token: '{{DATE_OF_BIRTH}}', labelKey: 'admin.forms.field_dob' },
  { token: '{{PATIENT_SIGNATURE}}', labelKey: 'admin.forms.field_patient_sig' },
  { token: '{{PATIENT_/_GUARDIAN_SIGNATURE}}', labelKey: 'admin.forms.field_guardian_sig' },
  { token: '{{PHYSICIAN_SIGNATURE}}', labelKey: 'admin.forms.field_physician_sig' },
] as const

export function isConsentFormHtmlEmpty(html: string): boolean {
  const trimmed = html.trim()
  if (!trimmed) return true
  const textOnly = trimmed
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
  return !textOnly
}
