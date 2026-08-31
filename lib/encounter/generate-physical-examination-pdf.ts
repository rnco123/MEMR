import {
  coerceSystemStatus,
  formatFindingLabels,
  formatPhysicalExaminationForContext,
  getExamSystemStatus,
  getRosSystemStatus,
  type ExamData,
  type FindingSelectionMap,
  type PhysicalExamAuditSummary,
  type PhysicalExaminationData,
  type RosData,
  type RosExamData,
  type SystemStatus,
} from '@/lib/encounter/physical-examination'
import { EXAM_ROWS, ROS_ROWS, type ExamRowDef, type RosRowDef } from '@/lib/encounter/physical-examination-rows'

export type PhysicalExaminationPdfContext = {
  patientName: string
  patientDob?: string | null
  encounterId: number
  encounterCode?: string | null
  encounterDate?: string | null
  /** When the exam was first recorded; preferred over the scheduled appointment date. */
  examRecordedAt?: string | null
  lastAudit: PhysicalExamAuditSummary
  rosExam: RosExamData
  legacyExam?: PhysicalExaminationData
}

type JsPdfDoc = import('jspdf').jsPDF

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 42
const CONTENT_W = PAGE_W - MARGIN * 2
const BOTTOM = PAGE_H - 46

const INK = { r: 15, g: 23, b: 42 } as const
const MUTED = { r: 100, g: 116, b: 139 } as const
const LINE = { r: 226, g: 232, b: 240 } as const
const PANEL = { r: 248, g: 250, b: 252 } as const
const BRAND = { r: 46, g: 110, b: 243 } as const

const STATUS_META: Record<
  NonNullable<SystemStatus>,
  { label: string; rowFill: [number, number, number]; pillFill: [number, number, number]; text: [number, number, number] }
> = {
  N: { label: 'Normal', rowFill: [240, 253, 244], pillFill: [209, 250, 229], text: [4, 120, 87] },
  A: { label: 'Abnormal', rowFill: [254, 242, 242], pillFill: [254, 226, 226], text: [185, 28, 28] },
  NA: { label: 'Not assessed', rowFill: [248, 250, 252], pillFill: [241, 245, 249], text: [71, 85, 105] },
}

function formatUsDate(dateString: string | null | undefined): string {
  if (!dateString?.trim()) return '—'
  const d = new Date(dateString.includes('T') ? dateString : `${dateString.trim().slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateString.trim()
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

function formatAuditLine(audit: NonNullable<PhysicalExamAuditSummary>): string {
  const when = formatUsDate(audit.updated_at)
  const name = audit.editor_name?.trim() || 'Unknown'
  const role = audit.editor_role?.trim() || ''
  return role ? `Last saved by ${name} (${role}) · ${when}` : `Last saved by ${name} · ${when}`
}

function rosExamHasContent(data: RosExamData | null | undefined): boolean {
  if (!data) return false
  if (data.remarks?.trim()) return true
  if (data.ros_findings && Object.keys(data.ros_findings).length) return true
  if (data.exam_findings && Object.keys(data.exam_findings).length) return true
  for (const v of Object.values(data.ros ?? {})) {
    if (coerceSystemStatus(v)) return true
    if (typeof v === 'string' && v.trim()) return true
  }
  for (const v of Object.values(data.exam ?? {})) {
    if (coerceSystemStatus(v)) return true
    if (typeof v === 'string' && v.trim()) return true
  }
  return false
}

export function physicalExaminationHasChartContent(args: {
  rosExam?: RosExamData | null
  legacyExam?: PhysicalExaminationData | null
}): boolean {
  if (rosExamHasContent(args.rosExam)) return true
  return Boolean(formatPhysicalExaminationForContext(args.legacyExam))
}

function collectExtras(
  data: Record<string, unknown> | undefined,
  extras?: Array<{ key: string; placeholder: string }>
): string[] {
  if (!extras?.length || !data) return []
  return extras
    .map((ex) => {
      const value = data[ex.key]
      if (typeof value !== 'string' || !value.trim()) return null
      return `${ex.placeholder}: ${value.trim()}`
    })
    .filter(Boolean) as string[]
}

function countStatuses(data: RosExamData): Record<NonNullable<SystemStatus>, number> {
  const counts = { N: 0, A: 0, NA: 0 }
  for (const row of ROS_ROWS) {
    const status = getRosSystemStatus(data, row.key)
    if (status) counts[status] += 1
  }
  for (const row of EXAM_ROWS) {
    const status = getExamSystemStatus(data, row.key)
    if (status) counts[status] += 1
  }
  return counts
}

class PhysicalExamPdfLayout {
  private y = MARGIN

  constructor(private doc: JsPdfDoc) {}

  private newPageIfNeeded(height: number) {
    if (this.y + height > BOTTOM) {
      this.doc.addPage()
      this.y = MARGIN
    }
  }

  private setInk(size: number, style: 'normal' | 'bold' | 'italic' = 'normal') {
    this.doc.setFont('helvetica', style)
    this.doc.setFontSize(size)
    this.doc.setTextColor(INK.r, INK.g, INK.b)
  }

  drawDocumentHeader(ctx: PhysicalExaminationPdfContext) {
    this.setInk(22, 'bold')
    this.doc.text('Physical Examination', MARGIN, this.y)
    this.setInk(9, 'normal')
    this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    this.doc.text('Patient chart · latest saved record', PAGE_W - MARGIN, this.y, { align: 'right' })
    this.y += 26

    const boxH = ctx.lastAudit ? 84 : 68
    this.newPageIfNeeded(boxH + 10)
    this.doc.setFillColor(PANEL.r, PANEL.g, PANEL.b)
    this.doc.setDrawColor(LINE.r, LINE.g, LINE.b)
    this.doc.roundedRect(MARGIN, this.y, CONTENT_W, boxH, 6, 6, 'FD')

    const innerX = MARGIN + 14
    const innerY = this.y + 16
    const colW = (CONTENT_W - 28) / 2

    this.setInk(9, 'bold')
    this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    this.doc.text('PATIENT', innerX, innerY)
    this.doc.text('VISIT', innerX + colW, innerY)

    this.setInk(12, 'bold')
    this.doc.setTextColor(INK.r, INK.g, INK.b)
    this.doc.text(ctx.patientName, innerX, innerY + 16)
    const visitLine = ctx.encounterCode?.trim()
      ? `Encounter ${ctx.encounterCode.trim()}`
      : `Encounter #${ctx.encounterId}`
    this.doc.text(visitLine, innerX + colW, innerY + 16)

    this.setInk(10, 'normal')
    this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    if (ctx.patientDob) this.doc.text(`DOB ${formatUsDate(ctx.patientDob)}`, innerX, innerY + 34)
    // The appointment date is when the visit was booked; the exam is filed under
    // the day it was actually recorded, which can differ from the booking.
    const examDate = ctx.examRecordedAt ?? ctx.encounterDate
    if (examDate) {
      this.doc.text(`Examination date ${formatUsDate(examDate)}`, innerX + colW, innerY + 34)
    }

    if (ctx.lastAudit) {
      this.doc.setFont('helvetica', 'italic')
      this.doc.setFontSize(9)
      this.doc.text(formatAuditLine(ctx.lastAudit), innerX, innerY + 54)
    }

    this.doc.setTextColor(INK.r, INK.g, INK.b)
    this.y += boxH + 16
  }

  drawSummary(counts: Record<NonNullable<SystemStatus>, number>) {
    const total = counts.N + counts.A + counts.NA
    if (total === 0) return

    this.newPageIfNeeded(28)
    const parts: string[] = []
    if (counts.N) parts.push(`${counts.N} normal`)
    if (counts.A) parts.push(`${counts.A} abnormal`)
    if (counts.NA) parts.push(`${counts.NA} not assessed`)

    this.doc.setFillColor(238, 245, 255)
    this.doc.setDrawColor(191, 219, 254)
    this.doc.roundedRect(MARGIN, this.y, CONTENT_W, 26, 4, 4, 'FD')
    this.setInk(10, 'bold')
    this.doc.setTextColor(BRAND.r, BRAND.g, BRAND.b)
    this.doc.text(`Summary: ${parts.join(' · ')}`, MARGIN + 12, this.y + 16)
    this.doc.setTextColor(INK.r, INK.g, INK.b)
    this.y += 32
  }

  private drawSectionTitle(title: string) {
    this.newPageIfNeeded(30)
    this.doc.setFillColor(BRAND.r, BRAND.g, BRAND.b)
    this.doc.rect(MARGIN, this.y, CONTENT_W, 24, 'F')
    this.setInk(11, 'bold')
    this.doc.setTextColor(255, 255, 255)
    this.doc.text(title, MARGIN + 10, this.y + 16)
    this.doc.setTextColor(INK.r, INK.g, INK.b)
    this.y += 24
  }

  private drawTableHeader() {
    const systemW = 156
    const statusW = 112
    const detailsX = MARGIN + systemW + statusW + 8

    this.doc.setFillColor(PANEL.r, PANEL.g, PANEL.b)
    this.doc.rect(MARGIN, this.y, CONTENT_W, 20, 'F')
    this.doc.setDrawColor(LINE.r, LINE.g, LINE.b)
    this.doc.setLineWidth(0.5)
    this.doc.line(MARGIN, this.y + 20, MARGIN + CONTENT_W, this.y + 20)

    this.setInk(8, 'bold')
    this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    this.doc.text('SYSTEM', MARGIN + 8, this.y + 13)
    this.doc.text('STATUS', MARGIN + systemW + 8, this.y + 13)
    this.doc.text('DETAILS', detailsX, this.y + 13)
    this.doc.setTextColor(INK.r, INK.g, INK.b)
    this.y += 20

    return { systemW, statusW, detailsX, detailsW: CONTENT_W - systemW - statusW - 16 }
  }

  private measureTableRow(label: string, extras: string[], detailsW: number): number {
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(10)
    const labelLines = this.doc.splitTextToSize(label.replace(/:$/, ''), 140)
    let h = Math.max(24, 12 + labelLines.length * 11)

    if (extras.length) {
      this.doc.setFont('helvetica', 'normal')
      this.doc.setFontSize(9)
      const extraLines = this.doc.splitTextToSize(extras.join(' · '), detailsW)
      h = Math.max(h, 14 + extraLines.length * 10)
    }
    return h
  }

  private drawStatusPill(x: number, y: number, status: SystemStatus | undefined): void {
    const pillW = 92
    const pillH = 16

    if (status === 'N' || status === 'A' || status === 'NA') {
      const meta = STATUS_META[status]
      this.doc.setFillColor(...meta.pillFill)
      this.doc.setDrawColor(...meta.text)
      this.doc.setLineWidth(0.5)
      this.doc.roundedRect(x, y, pillW, pillH, 3, 3, 'FD')
      this.doc.setFont('helvetica', 'bold')
      this.doc.setFontSize(9)
      this.doc.setTextColor(...meta.text)
      this.doc.text(meta.label, x + 8, y + 11)
    } else {
      this.doc.setFillColor(255, 255, 255)
      this.doc.setDrawColor(LINE.r, LINE.g, LINE.b)
      this.doc.roundedRect(x, y, pillW, pillH, 3, 3, 'FD')
      this.doc.setFont('helvetica', 'normal')
      this.doc.setFontSize(9)
      this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
      this.doc.text('Not recorded', x + 8, y + 11)
    }
    this.doc.setTextColor(INK.r, INK.g, INK.b)
  }

  private drawTableRow(
    label: string,
    status: SystemStatus | undefined,
    extras: string[],
    layout: { systemW: number; statusW: number; detailsX: number; detailsW: number }
  ): number {
    const rowH = this.measureTableRow(label, extras, layout.detailsW)
    this.newPageIfNeeded(rowH)

    if (status === 'N' || status === 'A' || status === 'NA') {
      const fill = STATUS_META[status].rowFill
      this.doc.setFillColor(...fill)
      this.doc.rect(MARGIN, this.y, CONTENT_W, rowH, 'F')
    }

    this.doc.setDrawColor(LINE.r, LINE.g, LINE.b)
    this.doc.setLineWidth(0.5)
    this.doc.line(MARGIN, this.y + rowH, MARGIN + CONTENT_W, this.y + rowH)

    this.setInk(10, 'bold')
    const cleanLabel = label.replace(/:$/, '')
    const labelLines = this.doc.splitTextToSize(cleanLabel, layout.systemW - 12)
    this.doc.text(labelLines, MARGIN + 8, this.y + 14)

    this.drawStatusPill(MARGIN + layout.systemW + 6, this.y + 5, status)

    if (extras.length) {
      this.setInk(9, 'normal')
      this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
      const extraLines = this.doc.splitTextToSize(extras.join(' · '), layout.detailsW)
      this.doc.text(extraLines, layout.detailsX, this.y + 14)
      this.doc.setTextColor(INK.r, INK.g, INK.b)
    }

    this.y += rowH
    return rowH
  }

  private drawSystemTable(
    title: string,
    rows: RosRowDef[] | ExamRowDef[],
    getStatus: (key: string) => SystemStatus | undefined,
    getSectionData: () => Record<string, unknown> | undefined,
    findings: FindingSelectionMap | undefined
  ) {
    const blockTop = this.y
    this.drawSectionTitle(title)
    const layout = this.drawTableHeader()

    for (const row of rows) {
      const status = getStatus(row.key)
      const extras = collectExtras(getSectionData(), row.extras)
      const abnormal = formatFindingLabels(findings?.[row.key])
      if (abnormal) extras.unshift(`Abnormal: ${abnormal}`)
      this.drawTableRow(row.label, status, extras, layout)
    }

    this.doc.setDrawColor(LINE.r, LINE.g, LINE.b)
    this.doc.setLineWidth(0.75)
    this.doc.rect(MARGIN, blockTop, CONTENT_W, this.y - blockTop)
    this.y += 14
  }

  drawRosExamTables(ctx: PhysicalExaminationPdfContext) {
    this.drawSummary(countStatuses(ctx.rosExam))

    this.drawSystemTable(
      'Review of Systems (ROS)',
      ROS_ROWS,
      (key) => getRosSystemStatus(ctx.rosExam, key as keyof RosData),
      () => ctx.rosExam.ros as Record<string, unknown> | undefined,
      ctx.rosExam.ros_findings
    )

    this.drawSystemTable(
      'Physical Examination (EXAM)',
      EXAM_ROWS,
      (key) => getExamSystemStatus(ctx.rosExam, key as keyof ExamData),
      () => ctx.rosExam.exam as Record<string, unknown> | undefined,
      ctx.rosExam.exam_findings
    )
  }

  drawRemarks(remarks: string) {
    this.newPageIfNeeded(56)
    this.setInk(12, 'bold')
    this.doc.text('Remarks', MARGIN, this.y)
    this.y += 14

    const text = remarks.trim()
    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(11)
    const lines = this.doc.splitTextToSize(text, CONTENT_W - 24)
    const boxH = Math.max(44, lines.length * 13 + 22)
    this.newPageIfNeeded(boxH + 8)

    this.doc.setFillColor(255, 255, 255)
    this.doc.setDrawColor(LINE.r, LINE.g, LINE.b)
    this.doc.roundedRect(MARGIN, this.y, CONTENT_W, boxH, 4, 4, 'FD')
    this.doc.setTextColor(INK.r, INK.g, INK.b)
    this.doc.text(lines, MARGIN + 12, this.y + 18)
    this.y += boxH + 14
  }

  drawLegacyFindings(text: string) {
    this.newPageIfNeeded(40)
    this.setInk(12, 'bold')
    this.doc.text('Examination findings', MARGIN, this.y)
    this.y += 16
    this.setInk(11, 'normal')
    const lines = this.doc.splitTextToSize(text, CONTENT_W)
    for (const line of lines) {
      this.newPageIfNeeded(14)
      this.doc.text(line, MARGIN, this.y)
      this.y += 14
    }
    this.y += 8
  }

  drawFooter() {
    this.doc.setFont('helvetica', 'italic')
    this.doc.setFontSize(8)
    this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    this.doc.text('Generated from the latest saved physical examination in MEMR.', MARGIN, PAGE_H - 26)
    this.doc.setTextColor(INK.r, INK.g, INK.b)
  }
}

/** Server-side letter-size PDF for the patient chart physical examination document. */
export async function generatePhysicalExaminationPdfBytes(
  ctx: PhysicalExaminationPdfContext
): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const layout = new PhysicalExamPdfLayout(doc)

  layout.drawDocumentHeader(ctx)

  if (rosExamHasContent(ctx.rosExam)) {
    layout.drawRosExamTables(ctx)
    if (ctx.rosExam.remarks?.trim()) {
      layout.drawRemarks(ctx.rosExam.remarks)
    }
  } else {
    const legacyText = formatPhysicalExaminationForContext(ctx.legacyExam)
    if (legacyText) layout.drawLegacyFindings(legacyText)
  }

  layout.drawFooter()

  const arrayBuffer = doc.output('arraybuffer')
  return new Uint8Array(arrayBuffer)
}
