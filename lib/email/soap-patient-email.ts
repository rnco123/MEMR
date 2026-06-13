import type { SoapNotePayload } from '@/lib/soap/encounter-doctor-soap'
import type { PharmEmailClinicInfo, PharmEmailDoctorInfo } from '@/lib/email/resolve-pharm-email-context'

export type SoapPatientEmailContext = {
  encounterId: number
  encounterCode: string | null
  patientName: string
  visitDate: string | null
  doctor: PharmEmailDoctorInfo
  clinic: PharmEmailClinicInfo
  soap: SoapNotePayload
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cell(value: string | null | undefined): string {
  const text = (value ?? '').trim()
  return escapeHtml(text || '—')
}

function sectionBlock(title: string, body: string): string {
  return `
    <div style="margin-bottom:16px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(title)}</p>
      <p style="margin:0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;line-height:1.5;color:#0f172a;white-space:pre-wrap;">${cell(body)}</p>
    </div>`
}

function sectionText(title: string, body: string): string {
  return `${title}\n${(body || '—').trim()}\n`
}

export function buildSoapPatientEmail(ctx: SoapPatientEmailContext): { subject: string; html: string; text: string } {
  const clinicName = ctx.clinic.name?.trim() || 'Your clinic'
  const subject = `Visit summary — ${ctx.patientName}${ctx.encounterCode ? ` (#${ctx.encounterCode})` : ''}`

  const html = `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:640px;margin:24px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="padding:24px 28px;background:#2E6EF3;color:#ffffff;">
        <h1 style="margin:0;font-size:20px;font-weight:700;">Visit summary (SOAP notes)</h1>
        <p style="margin:8px 0 0;font-size:13px;opacity:0.9;">${cell(clinicName)}</p>
      </div>
      <div style="padding:24px 28px;">
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Dear ${cell(ctx.patientName)},</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#475569;">
          Below is a summary of your recent visit. If you have questions about your care, please contact your clinic.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
          <tr><td style="padding:6px 0;color:#64748b;width:140px;">Encounter</td><td style="padding:6px 0;">#${ctx.encounterId}${ctx.encounterCode ? ` (${cell(ctx.encounterCode)})` : ''}</td></tr>
          ${ctx.visitDate ? `<tr><td style="padding:6px 0;color:#64748b;">Visit date</td><td style="padding:6px 0;">${cell(ctx.visitDate)}</td></tr>` : ''}
          ${ctx.doctor.name ? `<tr><td style="padding:6px 0;color:#64748b;">Provider</td><td style="padding:6px 0;">${cell(ctx.doctor.name)}</td></tr>` : ''}
          ${ctx.clinic.phone ? `<tr><td style="padding:6px 0;color:#64748b;">Clinic phone</td><td style="padding:6px 0;">${cell(ctx.clinic.phone)}</td></tr>` : ''}
        </table>
        ${sectionBlock('Subjective', ctx.soap.subjective_text)}
        ${sectionBlock('Objective', ctx.soap.objective_text)}
        ${sectionBlock('Assessment', ctx.soap.assessment_text)}
        ${sectionBlock('Plan', ctx.soap.plan_text)}
        <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
          This message may contain protected health information. Please do not forward it to others.
        </p>
      </div>
    </div>
  </body>
</html>`.trim()

  const text = [
    `Visit summary (SOAP notes) — ${clinicName}`,
    '',
    `Dear ${ctx.patientName},`,
    '',
    'Below is a summary of your recent visit.',
    '',
    `Encounter: #${ctx.encounterId}${ctx.encounterCode ? ` (${ctx.encounterCode})` : ''}`,
    ctx.visitDate ? `Visit date: ${ctx.visitDate}` : null,
    ctx.doctor.name ? `Provider: ${ctx.doctor.name}` : null,
    ctx.clinic.phone ? `Clinic phone: ${ctx.clinic.phone}` : null,
    '',
    sectionText('Subjective', ctx.soap.subjective_text),
    sectionText('Objective', ctx.soap.objective_text),
    sectionText('Assessment', ctx.soap.assessment_text),
    sectionText('Plan', ctx.soap.plan_text),
    '',
    'This message may contain protected health information.',
  ]
    .filter(Boolean)
    .join('\n')

  return { subject, html, text }
}
