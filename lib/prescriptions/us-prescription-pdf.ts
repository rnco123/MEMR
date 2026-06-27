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
  const left = 43
  const maxW = 530
  const right = left + maxW
  const bottom = 748
  let y = 43

  const newPageIfNeeded = (height: number) => {
    if (y + height > bottom) {
      doc.addPage()
      y = 43
    }
  }

  const writeLine = (text: string, fontSize: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('times', style)
    doc.setFontSize(fontSize)
    doc.setTextColor(0, 0, 0)
    const lines = doc.splitTextToSize(text, maxW)
    for (const line of lines) {
      newPageIfNeeded(fontSize + 4)
      doc.text(line, left, y)
      y += fontSize + 3
    }
  }

  const writeField = (label: string, value: string) => {
    writeLine(`${label} ${textOrDash(value)}`, 10.5)
  }

  const writeSectionTitle = (title: string) => {
    newPageIfNeeded(18)
    doc.setDrawColor(153, 153, 153)
    doc.line(left, y, right, y)
    y += 10
    doc.setFont('times', 'bold')
    doc.setFontSize(10)
    doc.text(title.toUpperCase(), left, y)
    y += 12
  }

  doc.setFont('times', 'bold')
  doc.setFontSize(16)
  doc.text(textOrDash(ctx.clinic.name || 'Clinic'), left, y)
  y += 18

  doc.setFont('times', 'normal')
  doc.setFontSize(10.5)
  if (ctx.clinic.address?.trim()) {
    writeLine(ctx.clinic.address.trim(), 10.5)
  }
  if (ctx.clinic.phone?.trim()) {
    writeLine(`Phone: ${ctx.clinic.phone.trim()}`, 10.5)
  }
  if (ctx.clinic.email?.trim()) {
    writeLine(`Email: ${ctx.clinic.email.trim()}`, 10.5)
  }

  y += 4
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(1.5)
  doc.line(left, y, right, y)
  y += 16

  writeLine('Prescription — U.S. Format', 13, 'bold')
  y += 2
  writeField('Date written:', formatUsDate(ctx.appointmentDate ?? ctx.printedAt.slice(0, 10)))
  writeField('Encounter #:', String(ctx.encounterId))
  y += 6

  const patientStartY = y
  writeSectionTitle('Patient')
  writeField('Name:', ctx.patient.name)
  writeField('DOB:', formatUsDate(ctx.patient.date_of_birth))
  if (ctx.patient.phone?.trim()) writeField('Phone:', ctx.patient.phone)
  if (ctx.patient.address?.trim()) writeField('Address:', ctx.patient.address)
  const patientEndY = y

  y = patientStartY
  const prescriberX = left + maxW / 2 + 12
  doc.setFont('times', 'bold')
  doc.setFontSize(10)
  doc.text('PRESCRIBER', prescriberX, y)
  y += 10
  doc.setDrawColor(153, 153, 153)
  doc.line(prescriberX, y, right, y)
  y += 12

  const writePrescriberField = (label: string, value: string) => {
    doc.setFont('times', 'bold')
    doc.setFontSize(10.5)
    doc.text(`${label}`, prescriberX, y)
    doc.setFont('times', 'normal')
    const lines = doc.splitTextToSize(textOrDash(value), maxW / 2 - 12)
    doc.text(lines, prescriberX + 52, y)
    y += Math.max(lines.length * 12, 12)
  }

  writePrescriberField('Provider:', ctx.doctor.name ?? '')
  writePrescriberField('NPI:', ctx.doctor.npi ?? '')
  if (ctx.doctor.specialty?.trim()) writePrescriberField('Specialty:', ctx.doctor.specialty)
  if (ctx.doctor.phone?.trim()) writePrescriberField('Phone:', ctx.doctor.phone)
  const prescriberEndY = y

  y = Math.max(patientEndY, prescriberEndY) + 8

  if (ctx.pharmacy) {
    writeSectionTitle('Pharmacy')
    writeField('Name:', ctx.pharmacy.name ?? '')
    if (ctx.pharmacy.address?.trim()) writeField('Address:', ctx.pharmacy.address)
    if (ctx.pharmacy.phone?.trim()) writeField('Phone:', ctx.pharmacy.phone)
    y += 4
  }

  writeSectionTitle('Medications')

  for (const [index, rx] of ctx.prescriptions.entries()) {
    newPageIfNeeded(90)
    y += 2
    writeLine(`Rx ${index + 1}`, 10, 'bold')
    writeLine(formatUsRxMedicationLine(rx), 13, 'bold')
    writeField('Sig:', formatUsRxSig(rx))
    writeField('Dispense:', formatUsRxDispense(rx))
    writeField('Refills:', String(rx.refills ?? 0))
    if (rx.notes?.trim()) writeField('Notes:', rx.notes.trim())
    y += 8
  }

  y += 8
  newPageIfNeeded(40)
  doc.setDrawColor(153, 153, 153)
  doc.line(left, y, right, y)
  y += 14
  writeField('Electronically prescribed by:', ctx.doctor.name ?? '')
  if (ctx.doctor.npi?.trim()) writeField('NPI:', ctx.doctor.npi)

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont('times', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(85, 85, 85)
    doc.text('Generated from MyclinicMD EMR.', left, 769)
  }

  return doc.output('blob')
}
