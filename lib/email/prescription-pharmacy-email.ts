import type { EncounterRxRow } from '@/lib/prescriptions/encounter-prescriptions'
import type { PharmEmailClinicInfo, PharmEmailDoctorInfo } from '@/lib/email/resolve-pharm-email-context'

export type PrescriptionPharmacyEmailContext = {
  encounterId: number
  patientName: string
  patientDob: string | null
  doctor: PharmEmailDoctorInfo
  clinic: PharmEmailClinicInfo
  pharmacyName: string | null
  prescriptions: EncounterRxRow[]
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

function prescriptionRowsHtml(prescriptions: EncounterRxRow[]): string {
  return prescriptions
    .map(
      (rx) => `
      <tr>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;">${cell(rx.medication_name)}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;">${cell(rx.strength)}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;">${cell(rx.dosage_instruction ?? rx.instructions ?? rx.dosage)}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;">${cell(rx.route)}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;">${cell(rx.frequency)}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;">${cell(rx.duration)}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;">${cell(rx.quantity)}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;">${String(rx.refills ?? 0)}</td>
      </tr>`
    )
    .join('')
}

function prescriptionRowsText(prescriptions: EncounterRxRow[]): string {
  return prescriptions
    .map((rx, index) => {
      const sig = rx.dosage_instruction ?? rx.instructions ?? rx.dosage
      return [
        `${index + 1}. ${rx.medication_name}`,
        rx.strength ? `   Strength: ${rx.strength}` : null,
        sig ? `   SIG: ${sig}` : null,
        rx.route ? `   Route: ${rx.route}` : null,
        rx.frequency ? `   Frequency: ${rx.frequency}` : null,
        rx.duration ? `   Duration: ${rx.duration}` : null,
        rx.quantity ? `   Quantity: ${rx.quantity}` : null,
        `   Refills: ${rx.refills ?? 0}`,
        rx.notes ? `   Notes: ${rx.notes}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}

export function buildPrescriptionPharmacyEmail(ctx: PrescriptionPharmacyEmailContext): {
  subject: string
  html: string
  text: string
} {
  const count = ctx.prescriptions.length
  const subject = `Prescription${count === 1 ? '' : 's'} for ${ctx.patientName} — Encounter #${ctx.encounterId}`

  const html = `
<!DOCTYPE html>
<html>
  <body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;margin:0;padding:24px;background:#f8fafc;">
    <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;color:#4c1d95;">New prescription${count === 1 ? '' : 's'} from clinic</h1>
      <p style="margin:0 0 20px;color:#475569;font-size:14px;">
        Please review the prescription details below for fulfillment.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        ${ctx.clinic.name ? `<tr><td style="padding:6px 0;color:#64748b;width:140px;">Clinic</td><td style="padding:6px 0;"><strong>${cell(ctx.clinic.name)}</strong></td></tr>` : ''}
        ${ctx.clinic.address ? `<tr><td style="padding:6px 0;color:#64748b;">Clinic address</td><td style="padding:6px 0;">${cell(ctx.clinic.address)}</td></tr>` : ''}
        ${ctx.clinic.phone ? `<tr><td style="padding:6px 0;color:#64748b;">Clinic phone</td><td style="padding:6px 0;">${cell(ctx.clinic.phone)}</td></tr>` : ''}
        ${ctx.clinic.email ? `<tr><td style="padding:6px 0;color:#64748b;">Clinic email</td><td style="padding:6px 0;">${cell(ctx.clinic.email)}</td></tr>` : ''}
        <tr><td colspan="2" style="padding:10px 0 4px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Patient</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;width:140px;">Name</td><td style="padding:6px 0;"><strong>${cell(ctx.patientName)}</strong></td></tr>
        ${ctx.patientDob ? `<tr><td style="padding:6px 0;color:#64748b;">Date of birth</td><td style="padding:6px 0;">${cell(ctx.patientDob)}</td></tr>` : ''}
        <tr><td colspan="2" style="padding:10px 0 4px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Prescriber</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;width:140px;">Doctor</td><td style="padding:6px 0;">${cell(ctx.doctor.name)}</td></tr>
        ${ctx.doctor.specialty ? `<tr><td style="padding:6px 0;color:#64748b;">Specialty</td><td style="padding:6px 0;">${cell(ctx.doctor.specialty)}</td></tr>` : ''}
        ${ctx.doctor.phone ? `<tr><td style="padding:6px 0;color:#64748b;">Doctor phone</td><td style="padding:6px 0;">${cell(ctx.doctor.phone)}</td></tr>` : ''}
        ${ctx.doctor.email ? `<tr><td style="padding:6px 0;color:#64748b;">Doctor email</td><td style="padding:6px 0;">${cell(ctx.doctor.email)}</td></tr>` : ''}
        <tr><td colspan="2" style="padding:10px 0 4px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Encounter</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;width:140px;">Encounter</td><td style="padding:6px 0;">#${ctx.encounterId}</td></tr>
        ${ctx.pharmacyName ? `<tr><td style="padding:6px 0;color:#64748b;">Pharmacy</td><td style="padding:6px 0;">${cell(ctx.pharmacyName)}</td></tr>` : ''}
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">Medication</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">Strength</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">SIG</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">Route</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">Frequency</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">Duration</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">Qty</th>
            <th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left;">Refills</th>
          </tr>
        </thead>
        <tbody>${prescriptionRowsHtml(ctx.prescriptions)}</tbody>
      </table>
      <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">
        Sent automatically from ${cell(ctx.clinic.name || 'the clinic EMR')}. Do not reply with protected health information unless using a secure channel approved by your clinic.
      </p>
    </div>
  </body>
</html>`.trim()

  const text = [
    `New prescription${count === 1 ? '' : 's'} from ${ctx.clinic.name || 'clinic'}`,
    '',
    ctx.clinic.name ? `Clinic: ${ctx.clinic.name}` : null,
    ctx.clinic.address ? `Clinic address: ${ctx.clinic.address}` : null,
    ctx.clinic.phone ? `Clinic phone: ${ctx.clinic.phone}` : null,
    ctx.clinic.email ? `Clinic email: ${ctx.clinic.email}` : null,
    '',
    `Patient: ${ctx.patientName}`,
    ctx.patientDob ? `Date of birth: ${ctx.patientDob}` : null,
    '',
    `Doctor: ${ctx.doctor.name ?? '—'}`,
    ctx.doctor.specialty ? `Specialty: ${ctx.doctor.specialty}` : null,
    ctx.doctor.phone ? `Doctor phone: ${ctx.doctor.phone}` : null,
    ctx.doctor.email ? `Doctor email: ${ctx.doctor.email}` : null,
    '',
    `Encounter: #${ctx.encounterId}`,
    ctx.pharmacyName ? `Pharmacy: ${ctx.pharmacyName}` : null,
    '',
    prescriptionRowsText(ctx.prescriptions),
  ]
    .filter(Boolean)
    .join('\n')

  return { subject, html, text }
}
