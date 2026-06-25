/**
 * Generates COMPLIANCE_ENCOUNTERS_AND_CHARTS.pdf in project root for meeting discussions.
 * Run: node scripts/generate-compliance-meeting-pdf.mjs
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT_PATH = resolve(ROOT, 'COMPLIANCE_ENCOUNTERS_AND_CHARTS.pdf')

const { jsPDF } = await import('jspdf')

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 48
const CONTENT_W = PAGE_W - MARGIN * 2
const BOTTOM = 756

const COLORS = {
  blue: [46, 110, 243],
  blueLight: [232, 240, 254],
  teal: [13, 148, 136],
  tealLight: [204, 251, 241],
  amber: [245, 158, 11],
  amberLight: [254, 243, 199],
  slate: [71, 85, 105],
  slateLight: [241, 245, 249],
  emerald: [16, 185, 129],
  emeraldLight: [209, 250, 229],
  purple: [124, 58, 237],
  purpleLight: [237, 233, 254],
  white: [255, 255, 255],
  black: [15, 23, 42],
  gray: [100, 116, 139],
}

function createDoc() {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  let y = MARGIN

  const newPage = () => {
    doc.addPage()
    y = MARGIN
  }

  const ensureSpace = (h) => {
    if (y + h > BOTTOM) newPage()
  }

  const setColor = (c, type = 'text') => {
    if (type === 'text') doc.setTextColor(...c)
    else if (type === 'fill') doc.setFillColor(...c)
    else doc.setDrawColor(...c)
  }

  const title = (text, size = 20) => {
    ensureSpace(36)
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(size)
    doc.text(text, MARGIN, y)
    y += size + 8
  }

  const subtitle = (text) => {
    ensureSpace(24)
    setColor(COLORS.gray, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(text, MARGIN, y)
    y += 18
  }

  const section = (text) => {
    ensureSpace(28)
    setColor(COLORS.blue, 'text')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(text, MARGIN, y)
    y += 6
    setColor(COLORS.slateLight, 'fill')
    doc.rect(MARGIN, y, CONTENT_W, 2, 'F')
    y += 16
  }

  const body = (text, size = 10) => {
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(text, CONTENT_W)
    for (const line of lines) {
      ensureSpace(size + 4)
      doc.text(line, MARGIN, y)
      y += size + 3
    }
    y += 4
  }

  const bullet = (text) => {
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const lines = doc.splitTextToSize(text, CONTENT_W - 14)
    ensureSpace((lines.length + 1) * 13)
    doc.text('•', MARGIN, y)
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], MARGIN + 12, y + i * 13)
    }
    y += lines.length * 13 + 4
  }

  const drawBox = (x, bx, by, w, h, label, sublabel, fill, stroke, fontSize = 10) => {
    setColor(fill, 'fill')
    setColor(stroke, 'draw')
    doc.setLineWidth(1.2)
    doc.roundedRect(bx, by, w, h, 6, 6, 'FD')
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(fontSize)
    doc.text(label, bx + w / 2, by + h / 2 - (sublabel ? 4 : 0), { align: 'center' })
    if (sublabel) {
      setColor(COLORS.gray, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(sublabel, bx + w / 2, by + h / 2 + 10, { align: 'center' })
    }
  }

  const arrow = (x1, y1, x2, y2, color = COLORS.slate) => {
    setColor(color, 'draw')
    doc.setLineWidth(1.5)
    doc.line(x1, y1, x2, y2)
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const head = 8
    doc.line(
      x2,
      y2,
      x2 - head * Math.cos(angle - 0.4),
      y2 - head * Math.sin(angle - 0.4)
    )
    doc.line(
      x2,
      y2,
      x2 - head * Math.cos(angle + 0.4),
      y2 - head * Math.sin(angle + 0.4)
    )
  }

  const drawEncounterVsChartDiagram = () => {
    ensureSpace(220)
    const startY = y
    const boxW = 200
    const boxH = 72
    const gap = 48
    const leftX = MARGIN + 20
    const rightX = MARGIN + CONTENT_W - boxW - 20
    const midY = startY + 50

    drawBox(
      'left',
      leftX,
      midY,
      boxW,
      boxH,
      'ENCOUNTER',
      'One visit / one day of care',
      COLORS.blueLight,
      COLORS.blue
    )
    drawBox(
      'right',
      rightX,
      midY,
      boxW,
      boxH,
      'CHART (Patient File)',
      'Full patient record over time',
      COLORS.tealLight,
      COLORS.teal
    )

    const centerX = MARGIN + CONTENT_W / 2
    arrow(leftX + boxW, midY + boxH / 2, rightX, midY + boxH / 2, COLORS.slate)

    setColor(COLORS.gray, 'text')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('Many encounters', centerX, midY + boxH / 2 - 14, { align: 'center' })
    doc.text('build the chart', centerX, midY + boxH / 2 - 4, { align: 'center' })

    const encItems = ['SOAP notes', 'Vitals', 'Intake', 'Orders', 'Rooming attestations']
    const chartItems = ['All encounters', 'Medical history', 'Medications', 'Forms', 'Documents']

    let iy = midY + boxH + 14
    doc.setFontSize(8)
    for (const item of encItems) {
      setColor(COLORS.gray, 'text')
      doc.text(`• ${item}`, leftX + 8, iy)
      iy += 11
    }

    iy = midY + boxH + 14
    for (const item of chartItems) {
      setColor(COLORS.gray, 'text')
      doc.text(`• ${item}`, rightX + 8, iy)
      iy += 11
    }

    y = midY + boxH + 80
    setColor(COLORS.amberLight, 'fill')
    setColor(COLORS.amber, 'draw')
    doc.roundedRect(MARGIN, y, CONTENT_W, 36, 4, 4, 'FD')
    setColor(COLORS.black, 'text')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Compliance audit unit = ONE ENCOUNTER', MARGIN + 12, y + 14)
    doc.setFont('helvetica', 'normal')
    doc.text(
      'Physician reviews NP/PA documentation per visit — not the entire chart at once.',
      MARGIN + 12,
      y + 26
    )
    y += 48
  }

  const drawEncounterLifecycle = () => {
    ensureSpace(200)
    const startY = y
    const steps = [
      { label: 'Check-in', sub: 'Appointment initiated', c: COLORS.purpleLight, s: COLORS.purple },
      { label: 'Rooming', sub: 'Vitals + compliance', c: COLORS.blueLight, s: COLORS.blue },
      { label: 'Consult', sub: 'Telemedicine / visit', c: COLORS.amberLight, s: COLORS.amber },
      { label: 'Final Review', sub: 'SOAP documentation', c: COLORS.tealLight, s: COLORS.teal },
      { label: 'Completed', sub: 'Visit closed', c: COLORS.emeraldLight, s: COLORS.emerald },
    ]
    const boxW = 88
    const boxH = 44
    const totalW = steps.length * boxW + (steps.length - 1) * 14
    let x = MARGIN + (CONTENT_W - totalW) / 2
    const by = startY + 20

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      drawBox(`step${i}`, x, by, boxW, boxH, step.label, step.sub, step.c, step.s, 9)
      if (i < steps.length - 1) {
        arrow(x + boxW, by + boxH / 2, x + boxW + 14, by + boxH / 2)
      }
      x += boxW + 14
    }

    y = by + boxH + 24
    body(
      'Each encounter moves through this workflow independently. Status is tracked on the encounter record; timeline events are logged for audit.'
    )
  }

  const drawComplianceFlow = () => {
    ensureSpace(240)
    const startY = y
    const colW = 150
    const rowH = 52
    const cx = MARGIN + CONTENT_W / 2

    drawBox('np', cx - colW / 2, startY, colW, rowH, 'NP/PA completes', 'encounter documentation', COLORS.blueLight, COLORS.blue, 9)
    arrow(cx, startY + rowH, cx, startY + rowH + 28)
    drawBox(
      'audit',
      cx - colW / 2,
      startY + rowH + 28,
      colW,
      rowH,
      'Audit row created',
      'status: pending',
      COLORS.amberLight,
      COLORS.amber,
      9
    )
    arrow(cx, startY + rowH + 28 + rowH, cx, startY + rowH + 28 + rowH + 28)

    const mdW = 170
    drawBox(
      'md',
      cx - mdW / 2,
      startY + rowH + 28 + rowH + 28,
      mdW,
      rowH,
      'MD reviews in Compliance',
      'SOAP + notes + sign-off',
      COLORS.emeraldLight,
      COLORS.emerald,
      9
    )

    const branchY = startY + rowH + 28 + rowH + 28 + rowH + 20
    arrow(cx, branchY, cx - 80, branchY + 40)
    arrow(cx, branchY, cx + 80, branchY + 40)

    drawBox(
      'done',
      cx - 130,
      branchY + 40,
      120,
      40,
      'Review complete',
      '10% numerator',
      COLORS.emeraldLight,
      COLORS.emerald,
      8
    )
    drawBox(
      'chart',
      cx + 10,
      branchY + 40,
      120,
      40,
      'Open Patient File',
      'full chart context',
      COLORS.tealLight,
      COLORS.teal,
      8
    )

    y = branchY + 100
  }

  const drawTable = (headers, rows, colWidths) => {
    const rowH = 22
    const headerH = 26
    let x = MARGIN
    ensureSpace(headerH + rows.length * rowH + 8)

    setColor(COLORS.blue, 'fill')
    doc.rect(MARGIN, y, CONTENT_W, headerH, 'F')
    setColor(COLORS.white, 'text')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    x = MARGIN
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x + 6, y + 17)
      x += colWidths[i]
    }
    y += headerH

    for (const row of rows) {
      setColor(COLORS.slateLight, 'fill')
      doc.rect(MARGIN, y, CONTENT_W, rowH, 'F')
      setColor(COLORS.black, 'text')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      x = MARGIN
      for (let i = 0; i < row.length; i++) {
        const cell = doc.splitTextToSize(row[i], colWidths[i] - 10)
        doc.text(cell[0] ?? '', x + 6, y + 15)
        x += colWidths[i]
      }
      y += rowH
    }
    y += 12
  }

  // ── Page 1: Cover + concepts ──
  setColor(COLORS.blue, 'text')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.text('MEMR Compliance Overview', MARGIN, 100)
  setColor(COLORS.black, 'text')
  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.text('Encounters vs. Charts — Implementation Summary', MARGIN, 128)

  setColor(COLORS.gray, 'text')
  doc.setFontSize(10)
  doc.text('MyClinicMD EMR · Meeting one-pager', MARGIN, 148)
  doc.text(`Generated ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`, MARGIN, 162)

  setColor(COLORS.blueLight, 'fill')
  doc.roundedRect(MARGIN, 180, CONTENT_W, 56, 6, 6, 'F')
  setColor(COLORS.black, 'text')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Purpose', MARGIN + 14, 202)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const purpose =
    'Support physician oversight of NP/PA documentation (10% chart review). Track audits per visit while keeping the full patient chart available for context.'
  const purposeLines = doc.splitTextToSize(purpose, CONTENT_W - 28)
  doc.text(purposeLines, MARGIN + 14, 218)

  y = 270
  section('1. Encounter vs. Chart — Key Concepts')
  drawEncounterVsChartDiagram()

  section('2. Encounter Lifecycle in MEMR')
  drawEncounterLifecycle()

  // ── Page 2: Implementation ──
  newPage()
  title('Implementation Details', 18)
  subtitle('How encounters, charts, and compliance connect in the current build')

  section('3. Data Model')
  bullet('encounters — one row per visit; status workflow, documenting_user_id (NP/PA who documented)')
  bullet('encounter_physician_reviews — one audit row per encounter when NP/PA documentation requires MD oversight')
  bullet('Patient File (chart) — aggregates all encounters, history, meds, forms, and uploaded documents for one patient')
  bullet('Review statuses: pending → reviewed | consult_concluded | physician_signed (MD-only visits: not_required)')

  section('4. When Audit Rows Are Created')
  body(
    'When an FNP or PA finishes encounter documentation (encounter completed, final review, or telemedicine wrap-up), the system:'
  )
  bullet('Identifies the documenting provider from encounter assignment and role')
  bullet('Sets documenting_user_id on the encounter')
  bullet('Creates a pending review row if one does not already exist')
  body('MD-documented visits do not create audit rows.')

  section('5. Compliance Dashboard')
  bullet('Routes: /admin/compliance and /dashboard/compliance')
  bullet('KPIs: total NP/PA encounters, required reviews (10%), completed, remaining, compliance %, pending, overdue')
  bullet('Provider table: per-NP/PA breakdown by clinic')
  bullet('Pending queue: patient, encounter date, days pending (overdue after 7 days), chief complaint')
  bullet('Review drawer: full SOAP, audit notes, findings, mark review complete')
  bullet('Link to Patient File for full chart review beyond that visit')

  section('6. 10% Compliance Rule')
  setColor(COLORS.slateLight, 'fill')
  ensureSpace(52)
  doc.roundedRect(MARGIN, y, CONTENT_W, 44, 4, 4, 'F')
  setColor(COLORS.black, 'text')
  doc.setFont('courier', 'normal')
  doc.setFontSize(9)
  doc.text('Required  = ceil(NP/PA encounters in period × 10%)', MARGIN + 12, y + 16)
  doc.text('Completed = reviews marked reviewed / consult_concluded / physician_signed', MARGIN + 12, y + 28)
  doc.text('Compliance % = completed ÷ required', MARGIN + 12, y + 40)
  y += 56

  section('7. Rooming & Compliance (per encounter)')
  body(
    'Separate from the 10% audit — rooming attestations captured on each encounter: identity verified, prescribing location, MA supervision, ready for doctor, pharmacy, consent timestamps, MA exam findings.'
  )

  // ── Page 3: Workflow + access ──
  newPage()
  title('Review Workflow & Access', 18)

  section('8. Physician Review Flow')
  drawComplianceFlow()

  section('9. Who Can Access Compliance')
  drawTable(
    ['Role', 'Dashboard', 'Can complete reviews'],
    [
      ['Admin', 'Yes — all locations', 'Yes'],
      ['Doctor (MD)', 'Yes — if compliance_access enabled', 'Yes (intended reviewer)'],
      ['FNP / PA', 'Yes — if compliance_access enabled', 'Yes (typically view own metrics)'],
      ['Nurse', 'No', 'No'],
    ],
    [100, 220, 196]
  )

  section('10. Encounter vs Chart — Discussion Points')
  bullet('An encounter is the unit of clinical workflow and documentation for a single visit.')
  bullet('A chart is the longitudinal patient record — many encounters plus static history and documents.')
  bullet('Compliance selects which encounters need MD review; Patient File provides full chart context.')
  bullet('Additive design: legacy encounters unchanged; audit is a parallel track on new NP/PA visits.')

  section('11. Demo Path (2 minutes)')
  bullet('Complete an encounter as NP/PA → pending review row appears')
  bullet('Open Compliance → see KPIs and pending queue')
  bullet('Review encounter → read SOAP, add notes, mark complete')
  bullet('Open Patient File → full chart for same patient')

  ensureSpace(40)
  setColor(COLORS.gray, 'text')
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.text('MEMR v3.3 · Migration 089 (encounter_physician_reviews) · Migration 092 (compliance_access)', MARGIN, y)

  const pdfBytes = doc.output('arraybuffer')
  writeFileSync(OUT_PATH, Buffer.from(pdfBytes))
  console.log(`Written: ${OUT_PATH}`)
}

createDoc()
