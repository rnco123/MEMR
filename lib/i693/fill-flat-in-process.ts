import type { I693FormData } from '@/lib/i693/types'
import { getNestedValue } from '@/lib/i693/field-sections'
import {
  aNumberToCells,
  valueToCells,
} from '@/lib/i693/pdf-char-cells'
import { readSlottedValue } from '@/lib/i693/pdf-field-slots'
import {
  PDF_ALL_CHAR_CELLS,
  PDF_ALL_TEXT_PLACEMENTS,
  pdfBoxTopToTextBaseline,
} from '@/lib/i693/pdf-editor-layout'
import { I693_OVERLAY_MARKS, type PdfTextPlacement } from '@/lib/i693/pdf-overlay-uscis-012025'

function formatDateForPdf(iso: string): string {
  const s = iso.trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return `${m[2]}/${m[3]}/${m[1]}`
  return s
}

function valueForKey(data: I693FormData, key: string, format?: 'date' | 'text'): string {
  const root = data as unknown as Record<string, unknown>
  const raw = getNestedValue(root, key)
  if (raw == null || raw === '') return ''
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No'
  const s = String(raw).trim()
  if (format === 'date') return formatDateForPdf(s)
  return s
}

/** MuPDF render + pdf-lib text overlay (Node only — do not bundle with webpack). */
export async function fillFlatI693PdfInProcess(
  templatePath: string,
  data: I693FormData
): Promise<{ bytes: Uint8Array; filled: string[] }> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const mupdf = await import(/* webpackIgnore: true */ 'mupdf')

  const srcDoc = mupdf.Document.openDocument(templatePath)
  const pageCount = srcDoc.countPages()
  const outDoc = await PDFDocument.create()
  const font = await outDoc.embedFont(StandardFonts.Helvetica)
  const filled: string[] = []

  const pageWidth = 612
  const pageHeight = 792
  const scale = 2

  for (let i = 0; i < pageCount; i++) {
    const page = srcDoc.loadPage(i)
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true
    )
    const pngBytes = new Uint8Array(pixmap.asPNG())
    const png = await outDoc.embedPng(pngBytes)
    const pdfPage = outDoc.addPage([pageWidth, pageHeight])
    pdfPage.drawImage(png, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    })
  }

  const pages = outDoc.getPages()

  const root = data as unknown as Record<string, unknown>

  for (const placement of PDF_ALL_TEXT_PLACEMENTS) {
    const text = textForPlacement(root, placement, placement.format)
    if (!text) continue
    const page = pages[placement.page]
    if (!page) continue
    const fontSize = placement.size ?? 9
    page.drawText(text, {
      x: placement.x,
      y: pdfBoxTopToTextBaseline(placement.y, fontSize),
      size: fontSize,
      font,
      color: rgb(0, 0, 0.85),
      maxWidth: placement.width ?? placement.maxWidth,
    })
    filled.push(placement.slot ? `${placement.key}:${placement.slot}` : placement.key)
  }

  for (const grid of PDF_ALL_CHAR_CELLS) {
    const page = pages[grid.page]
    if (!page) continue
    const raw = valueForKey(data, grid.key)
    if (!raw) continue
    const cells =
      grid.key === 'applicant.a_number'
        ? aNumberToCells(raw)
        : valueToCells(raw, grid.count, grid.mode ?? 'alnum')
    const fontSize = 9
    cells.forEach((ch, i) => {
      if (!ch) return
      page.drawText(ch, {
        x: grid.x + i * grid.cellWidth + 2,
        y: pdfBoxTopToTextBaseline(grid.y, fontSize),
        size: fontSize,
        font,
        color: rgb(0, 0, 0.85),
      })
    })
    filled.push(grid.key)
  }

  for (const mark of I693_OVERLAY_MARKS) {
    const raw = valueForKey(data, mark.key)
    if (raw !== mark.when) continue
    const page = pages[mark.page]
    if (!page) continue
    page.drawText('X', {
      x: mark.x + 1,
      y: pdfBoxTopToTextBaseline(mark.y, 10),
      size: 10,
      font,
      color: rgb(0, 0, 0.85),
    })
    filled.push(`${mark.key}:${mark.when}`)
  }

  const vacPage = pages[5]
  if (vacPage && data.vaccinations.length > 0) {
    let y = 440
    for (const v of data.vaccinations.slice(0, 6)) {
      const line = [v.vaccine_name, v.date_given ? formatDateForPdf(v.date_given) : '', v.waiver_reason]
        .filter(Boolean)
        .join(' — ')
      if (!line) continue
      vacPage.drawText(line.slice(0, 120), {
        x: 54,
        y: pdfBoxTopToTextBaseline(y, 7),
        size: 7,
        font,
        color: rgb(0, 0, 0.85),
        maxWidth: 500,
      })
      filled.push(`vaccination:${v.vaccine_name}`)
      y -= 14
    }
  }

  const bytes = await outDoc.save()
  return { bytes, filled }
}

function textForPlacement(
  root: Record<string, unknown>,
  placement: PdfTextPlacement,
  format?: 'date' | 'text'
): string {
  const raw = placement.slot
    ? readSlottedValue(root, placement)
    : String(getNestedValue(root, placement.key) ?? '').trim()
  if (!raw) return ''
  if (format === 'date') return formatDateForPdf(raw)
  return raw
}
