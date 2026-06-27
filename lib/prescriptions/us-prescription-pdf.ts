import {
  formatUsRxDispense,
  formatUsRxMedicationLine,
  formatUsRxSig,
} from '@/lib/prescriptions/format-us-rx-sig'
import type { PrescriptionPrintContext } from '@/lib/prescriptions/load-prescription-print-context'

function textOrDash(value: string | null | undefined): string {
  const text = (value ?? '').trim()
  return text || '—'
}

function formatUsDate(dateString: string | null | undefined): string {
  if (!dateString?.trim()) return '—'
  const d = new Date(`${dateString.trim().slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateString.trim()
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

/** Client-only: builds a letter-size prescription PDF. */
export async function buildUsPrescriptionPdfBlob(ctx: PrescriptionPrintContext): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })

  const margin = 54
  const pageW = 612
  const contentW = pageW - margin * 2
  const left = margin
  const right = left + contentW
  const bottom = 756
  const colGap = 16
  const colW = (contentW - colGap) / 2
  const col2X = left + colW + colGap
  const labelW = 58

  let y = margin

  const newPageIfNeeded = (height: number) => {
    if (y + height > bottom) {
      doc.addPage()
      y = margin
    }
  }

  const hr = (yPos: number, x1 = left, x2 = right, weight = 0.75) => {
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(weight)
    doc.line(x1, yPos, x2, yPos)
  }

  const writeWrapped = (
    text: string,
    x: number,
    startY: number,
    width: number,
    fontSize: number,
    style: 'normal' | 'bold' = 'normal'
  ): number => {
    doc.setFont('helvetica', style)
    doc.setFontSize(fontSize)
    doc.setTextColor(0, 0, 0)
    const lines = doc.splitTextToSize(text, width)
    let cy = startY
    for (const line of lines) {
      newPageIfNeeded(fontSize + 4)
      doc.text(line, x, cy)
      cy += fontSize + 4
    }
    return cy
  }

  const writeColumnHeader = (x: number, width: number, title: string, startY: number): number => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0)
    doc.text(title.toUpperCase(), x, startY)
    const lineY = startY + 4
    hr(lineY, x, x + width, 0.5)
    return lineY + 14
  }

  const writeColumnField = (
    x: number,
    width: number,
    label: string,
    value: string,
    startY: number
  ): number => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(label, x, startY)
    doc.setFont('helvetica', 'normal')
    const valueX = x + labelW
    const valueW = width - labelW
    const lines = doc.splitTextToSize(textOrDash(value), valueW)
    doc.text(lines, valueX, startY)
    return startY + Math.max(lines.length * 13, 15)
  }

  // ── Clinic header ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(textOrDash(ctx.clinic.name || 'Clinic'), left, y)
  y += 22

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const clinicLines: string[] = []
  if (ctx.clinic.address?.trim()) clinicLines.push(ctx.clinic.address.trim())
  if (ctx.clinic.phone?.trim()) clinicLines.push(`Tel: ${ctx.clinic.phone.trim()}`)
  if (ctx.clinic.email?.trim()) clinicLines.push(ctx.clinic.email.trim())
  for (const line of clinicLines) {
    doc.text(line, left, y)
    y += 13
  }

  y += 6
  hr(y, left, right, 1.5)
  y += 20

  // ── Title row ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('PRESCRIPTION', left, y)
  const dateLabel = 'Date written:'
  const dateValue = formatUsDate(ctx.appointmentDate ?? ctx.printedAt.slice(0, 10))
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const dateStr = `${dateLabel} ${dateValue}`
  const dateW = doc.getTextWidth(dateStr)
  doc.text(dateStr, right - dateW, y)
  y += 22

  // ── Patient | Prescriber (aligned columns) ──
  const blockStartY = y
  let patientY = writeColumnHeader(left, colW, 'Patient', blockStartY)
  patientY = writeColumnField(left, colW, 'Name:', ctx.patient.name ?? '', patientY)
  patientY = writeColumnField(left, colW, 'DOB:', formatUsDate(ctx.patient.date_of_birth), patientY)
  if (ctx.patient.phone?.trim()) {
    patientY = writeColumnField(left, colW, 'Phone:', ctx.patient.phone, patientY)
  }
  if (ctx.patient.address?.trim()) {
    patientY = writeColumnField(left, colW, 'Address:', ctx.patient.address, patientY)
  }

  let prescriberY = writeColumnHeader(col2X, colW, 'Prescriber', blockStartY)
  prescriberY = writeColumnField(col2X, colW, 'Provider:', ctx.doctor.name ?? '', prescriberY)
  prescriberY = writeColumnField(col2X, colW, 'NPI:', ctx.doctor.npi ?? '', prescriberY)
  if (ctx.doctor.specialty?.trim()) {
    prescriberY = writeColumnField(col2X, colW, 'Specialty:', ctx.doctor.specialty, prescriberY)
  }
  if (ctx.doctor.phone?.trim()) {
    prescriberY = writeColumnField(col2X, colW, 'Phone:', ctx.doctor.phone, prescriberY)
  }

  y = Math.max(patientY, prescriberY) + 10
  hr(y)
  y += 16

  // ── Pharmacy ──
  if (ctx.pharmacy) {
    y = writeColumnHeader(left, contentW, 'Pharmacy', y)
    y = writeColumnField(left, contentW, 'Name:', ctx.pharmacy.name ?? '', y)
    if (ctx.pharmacy.address?.trim()) {
      y = writeColumnField(left, contentW, 'Address:', ctx.pharmacy.address, y)
    }
    if (ctx.pharmacy.phone?.trim()) {
      y = writeColumnField(left, contentW, 'Phone:', ctx.pharmacy.phone, y)
    }
    y += 4
    hr(y)
    y += 16
  }

  // ── Medications ──
  y = writeColumnHeader(left, contentW, 'Medications', y)

  for (const [index, rx] of ctx.prescriptions.entries()) {
    newPageIfNeeded(100)
    const boxTop = y
    y += 10

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(80, 80, 80)
    doc.text(`Rx ${index + 1}`, left + 10, y)

    y += 14
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(0, 0, 0)
    y = writeWrapped(formatUsRxMedicationLine(rx), left + 10, y, contentW - 20, 12, 'bold') + 2

    y = writeColumnField(left + 10, contentW - 20, 'Sig:', formatUsRxSig(rx), y)
    y = writeColumnField(left + 10, contentW - 20, 'Dispense:', formatUsRxDispense(rx), y)
    y = writeColumnField(left + 10, contentW - 20, 'Refills:', String(rx.refills ?? 0), y)
    if (rx.notes?.trim()) {
      y = writeColumnField(left + 10, contentW - 20, 'Notes:', rx.notes.trim(), y)
    }

    y += 6
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.75)
    doc.rect(left, boxTop, contentW, y - boxTop)
    y += 12
  }

  // ── Signature ──
  y += 4
  newPageIfNeeded(50)
  hr(y)
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Electronically prescribed by: ${textOrDash(ctx.doctor.name)}`, left, y)
  if (ctx.doctor.npi?.trim()) {
    const npiStr = `NPI: ${ctx.doctor.npi.trim()}`
    const npiW = doc.getTextWidth(npiStr)
    doc.text(npiStr, right - npiW, y)
  }

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text('Generated from MyclinicMD EMR', left, 774)
  }

  return doc.output('blob')
}
