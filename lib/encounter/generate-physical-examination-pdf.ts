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
  /** Document language; the chart keeps an English and a Spanish copy. Defaults to English. */
  language?: PhysicalExamPdfLanguage
}

export type PhysicalExamPdfLanguage = 'en' | 'es'

const PDF_TEXT = {
  en: {
    title: 'Physical Examination',
    subtitle: 'Patient chart · latest saved record',
    patient: 'PATIENT',
    visit: 'VISIT',
    encounter: 'Encounter',
    dob: 'DOB',
    firstVisit: 'First visit date',
    lastSavedBy: 'Last saved by',
    unknown: 'Unknown',
    summary: 'Summary',
    normalCount: ['normal', 'normal'],
    abnormalCount: ['abnormal', 'abnormal'],
    notAssessedCount: ['not assessed', 'not assessed'],
    system: 'SYSTEM',
    status: 'STATUS',
    details: 'DETAILS',
    normal: 'Normal',
    abnormal: 'Abnormal',
    notAssessed: 'Not assessed',
    notRecorded: 'Not recorded',
    abnormalPrefix: 'Abnormal',
    rosTitle: 'Review of Systems (ROS)',
    examTitle: 'Physical Examination (EXAM)',
    remarks: 'Remarks',
    findings: 'Examination findings',
    footer: 'Generated from the latest saved physical examination in MEMR.',
  },
  es: {
    title: 'Examen físico',
    subtitle: 'Expediente del paciente · último registro guardado',
    patient: 'PACIENTE',
    visit: 'VISITA',
    encounter: 'Encuentro',
    dob: 'F. nac.',
    firstVisit: 'Fecha de primera visita',
    lastSavedBy: 'Guardado por última vez por',
    unknown: 'Desconocido',
    summary: 'Resumen',
    normalCount: ['normal', 'normales'],
    abnormalCount: ['anormal', 'anormales'],
    notAssessedCount: ['no evaluado', 'no evaluados'],
    system: 'SISTEMA',
    status: 'ESTADO',
    details: 'DETALLES',
    normal: 'Normal',
    abnormal: 'Anormal',
    notAssessed: 'No evaluado',
    notRecorded: 'No registrado',
    abnormalPrefix: 'Anormal',
    rosTitle: 'Revisión por sistemas (ROS)',
    examTitle: 'Examen físico (EXAM)',
    remarks: 'Observaciones',
    findings: 'Hallazgos del examen',
    footer: 'Generado a partir del último examen físico guardado en MEMR.',
  },
} as const

type PdfText = (typeof PDF_TEXT)[PhysicalExamPdfLanguage]

/** Spanish row labels (English labels come from the row definitions). */
const ES_ROS_LABELS: Record<string, string> = {
  cons: 'Generales',
  skin: 'Piel',
  eyes: 'Ojos',
  ears: 'Oídos',
  nose: 'Nariz',
  throat: 'Garganta',
  cv_resp: 'CV/Resp',
  gi: 'GI',
  gu: 'GU',
  gyn: 'GIN',
  male: 'Masculino',
  ms: 'Musculoesq.',
  neu: 'Neuro',
  psych: 'Psiq.',
  hemat_lymph: 'Hemat/Linf',
}
const ES_EXAM_LABELS: Record<string, string> = {
  general: 'General',
  skin: 'Piel',
  head: 'Cabeza',
  eyes: 'Ojos',
  ears: 'Oídos',
  nose: 'Nariz',
  throat: 'Garganta',
  neck: 'Cuello',
  cv: 'CV',
  respir: 'Resp',
  abdomen: 'Abdomen',
  gu: 'GU fem/masc',
  rectal: 'Rectal',
  ms: 'Musculoesq.',
  neuro: 'Neuro',
}
const ES_EXTRA_LABELS: Record<string, string> = {
  gyn_lmp: 'FUM',
  neu_numbness: 'Entumecimiento',
  neu_tingling: 'Hormigueo',
  ms_sites: 'Sitios examinados',
}
const ES_ROLES: Record<string, string> = {
  doctor: 'médico',
  fnp: 'FNP',
  pa: 'PA',
  nurse: 'enfermera',
  staff: 'enfermera',
  admin: 'administrador',
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
  {
    labelKey: 'normal' | 'abnormal' | 'notAssessed'
    rowFill: [number, number, number]
    pillFill: [number, number, number]
    text: [number, number, number]
  }
> = {
  N: { labelKey: 'normal', rowFill: [240, 253, 244], pillFill: [209, 250, 229], text: [4, 120, 87] },
  A: { labelKey: 'abnormal', rowFill: [254, 242, 242], pillFill: [254, 226, 226], text: [185, 28, 28] },
  NA: { labelKey: 'notAssessed', rowFill: [248, 250, 252], pillFill: [241, 245, 249], text: [71, 85, 105] },
}

function formatDocDate(dateString: string | null | undefined, language: PhysicalExamPdfLanguage): string {
  if (!dateString?.trim()) return '—'
  const d = new Date(dateString.includes('T') ? dateString : `${dateString.trim().slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateString.trim()
  return d.toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

function formatAuditLine(
  audit: NonNullable<PhysicalExamAuditSummary>,
  text: PdfText,
  language: PhysicalExamPdfLanguage
): string {
  const when = formatDocDate(audit.updated_at, language)
  const name = audit.editor_name?.trim() || text.unknown
  const rawRole = audit.editor_role?.trim() || ''
  const role = language === 'es' ? ES_ROLES[rawRole.toLowerCase()] ?? rawRole : rawRole
  return role ? `${text.lastSavedBy} ${name} (${role}) · ${when}` : `${text.lastSavedBy} ${name} · ${when}`
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
  extras: Array<{ key: string; placeholder: string }> | undefined,
  language: PhysicalExamPdfLanguage
): string[] {
  if (!extras?.length || !data) return []
  return extras
    .map((ex) => {
      const value = data[ex.key]
      if (typeof value !== 'string' || !value.trim()) return null
      const label = language === 'es' ? ES_EXTRA_LABELS[ex.key] ?? ex.placeholder : ex.placeholder
      return `${label}: ${value.trim()}`
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
  private text: PdfText

  constructor(
    private doc: JsPdfDoc,
    private language: PhysicalExamPdfLanguage
  ) {
    this.text = PDF_TEXT[language]
  }

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
    this.doc.text(this.text.title, MARGIN, this.y)
    this.setInk(9, 'normal')
    this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    this.doc.text(this.text.subtitle, PAGE_W - MARGIN, this.y, { align: 'right' })
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
    this.doc.text(this.text.patient, innerX, innerY)
    this.doc.text(this.text.visit, innerX + colW, innerY)

    this.setInk(12, 'bold')
    this.doc.setTextColor(INK.r, INK.g, INK.b)
    this.doc.text(ctx.patientName, innerX, innerY + 16)
    const visitLine = ctx.encounterCode?.trim()
      ? `${this.text.encounter} ${ctx.encounterCode.trim()}`
      : `${this.text.encounter} #${ctx.encounterId}`
    this.doc.text(visitLine, innerX + colW, innerY + 16)

    this.setInk(10, 'normal')
    this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    if (ctx.patientDob) {
      this.doc.text(`${this.text.dob} ${formatDocDate(ctx.patientDob, this.language)}`, innerX, innerY + 34)
    }
    const examDate = ctx.encounterDate ?? ctx.examRecordedAt
    if (examDate) {
      this.doc.text(`${this.text.firstVisit} ${formatDocDate(examDate, this.language)}`, innerX + colW, innerY + 34)
    }

    if (ctx.lastAudit) {
      this.doc.setFont('helvetica', 'italic')
      this.doc.setFontSize(9)
      this.doc.text(formatAuditLine(ctx.lastAudit, this.text, this.language), innerX, innerY + 54)
    }

    this.doc.setTextColor(INK.r, INK.g, INK.b)
    this.y += boxH + 16
  }

  drawSummary(counts: Record<NonNullable<SystemStatus>, number>) {
    const total = counts.N + counts.A + counts.NA
    if (total === 0) return

    this.newPageIfNeeded(28)
    const parts: string[] = []
    // [singular, plural]
    const word = (forms: readonly [string, string], n: number) => `${n} ${forms[n === 1 ? 0 : 1]}`
    if (counts.N) parts.push(word(this.text.normalCount, counts.N))
    if (counts.A) parts.push(word(this.text.abnormalCount, counts.A))
    if (counts.NA) parts.push(word(this.text.notAssessedCount, counts.NA))

    this.doc.setFillColor(238, 245, 255)
    this.doc.setDrawColor(191, 219, 254)
    this.doc.roundedRect(MARGIN, this.y, CONTENT_W, 26, 4, 4, 'FD')
    this.setInk(10, 'bold')
    this.doc.setTextColor(BRAND.r, BRAND.g, BRAND.b)
    this.doc.text(`${this.text.summary}: ${parts.join(' · ')}`, MARGIN + 12, this.y + 16)
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
    this.doc.text(this.text.system, MARGIN + 8, this.y + 13)
    this.doc.text(this.text.status, MARGIN + systemW + 8, this.y + 13)
    this.doc.text(this.text.details, detailsX, this.y + 13)
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
      this.doc.text(this.text[meta.labelKey], x + 8, y + 11)
    } else {
      this.doc.setFillColor(255, 255, 255)
      this.doc.setDrawColor(LINE.r, LINE.g, LINE.b)
      this.doc.roundedRect(x, y, pillW, pillH, 3, 3, 'FD')
      this.doc.setFont('helvetica', 'normal')
      this.doc.setFontSize(9)
      this.doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
      this.doc.text(this.text.notRecorded, x + 8, y + 11)
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
    findings: FindingSelectionMap | undefined,
    esLabels: Record<string, string>
  ) {
    const blockTop = this.y
    this.drawSectionTitle(title)
    const layout = this.drawTableHeader()

    for (const row of rows) {
      const status = getStatus(row.key)
      const extras = collectExtras(getSectionData(), row.extras, this.language)
      const abnormal = formatFindingLabels(findings?.[row.key])
      if (abnormal) extras.unshift(`${this.text.abnormalPrefix}: ${abnormal}`)
      const label = this.language === 'es' ? esLabels[row.key] ?? row.label : row.label
      this.drawTableRow(label, status, extras, layout)
    }

    this.doc.setDrawColor(LINE.r, LINE.g, LINE.b)
    this.doc.setLineWidth(0.75)
    this.doc.rect(MARGIN, blockTop, CONTENT_W, this.y - blockTop)
    this.y += 14
  }

  drawRosExamTables(ctx: PhysicalExaminationPdfContext) {
    this.drawSummary(countStatuses(ctx.rosExam))

    this.drawSystemTable(
      this.text.rosTitle,
      ROS_ROWS,
      (key) => getRosSystemStatus(ctx.rosExam, key as keyof RosData),
      () => ctx.rosExam.ros as Record<string, unknown> | undefined,
      ctx.rosExam.ros_findings,
      ES_ROS_LABELS
    )

    this.drawSystemTable(
      this.text.examTitle,
      EXAM_ROWS,
      (key) => getExamSystemStatus(ctx.rosExam, key as keyof ExamData),
      () => ctx.rosExam.exam as Record<string, unknown> | undefined,
      ctx.rosExam.exam_findings,
      ES_EXAM_LABELS
    )
  }

  drawRemarks(remarks: string) {
    this.newPageIfNeeded(56)
    this.setInk(12, 'bold')
    this.doc.text(this.text.remarks, MARGIN, this.y)
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
    this.doc.text(this.text.findings, MARGIN, this.y)
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
    this.doc.text(this.text.footer, MARGIN, PAGE_H - 26)
    this.doc.setTextColor(INK.r, INK.g, INK.b)
  }
}

/** Server-side letter-size PDF for the patient chart physical examination document. */
export async function generatePhysicalExaminationPdfBytes(
  ctx: PhysicalExaminationPdfContext
): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const layout = new PhysicalExamPdfLayout(doc, ctx.language ?? 'en')

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
