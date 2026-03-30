/**
 * Replace consent template placeholders with values and optional signature images.
 * Supported: {{PATIENT_NAME}}, {{DATE}}, {{DATE_OF_BIRTH}}, {{PATIENT_SIGNATURE}},
 * {{PATIENT_/_GUARDIAN_SIGNATURE}}, {{PHYSICIAN_SIGNATURE}}
 */

function escapeAttr(url: string): string {
  return url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function signatureImgOrDash(url: string | null | undefined): string {
  if (!url?.trim()) {
    return '<span style="color:#64748b;">—</span>'
  }
  return `<img class="consent-signature-img" src="${escapeAttr(url)}" alt="Signature" loading="lazy" decoding="async" style="display:inline-block;max-height:96px;max-width:min(100%,280px);width:auto;height:auto;vertical-align:middle;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,0.9);object-fit:contain;" />`
}

export type ConsentRenderVars = {
  patientName: string
  /** Display date for {{DATE}} */
  dateDisplay: string
  /** Display DOB for {{DATE_OF_BIRTH}} */
  dateOfBirthDisplay: string
  patientSignatureUrl: string | null
  physicianSignatureUrl: string | null
}

export function renderConsentFormHtml(templateHtml: string, vars: ConsentRenderVars): string {
  let html = templateHtml
  const name = vars.patientName || '—'
  const dob = vars.dateOfBirthDisplay || '—'
  const patientSig = signatureImgOrDash(vars.patientSignatureUrl)

  html = html.split('{{PATIENT_NAME}}').join(name)
  html = html.split('{{DATE}}').join(vars.dateDisplay || '—')
  html = html.split('{{DATE_OF_BIRTH}}').join(dob)
  html = html.split('{{PATIENT_SIGNATURE}}').join(patientSig)
  html = html.split('{{PATIENT_/_GUARDIAN_SIGNATURE}}').join(patientSig)
  html = html.split('{{PHYSICIAN_SIGNATURE}}').join(signatureImgOrDash(vars.physicianSignatureUrl))
  return html
}
