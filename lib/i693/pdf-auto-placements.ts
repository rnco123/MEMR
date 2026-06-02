import type { I693FieldDef } from '@/lib/i693/field-sections'
import { getPanelFieldsForPdfPage } from '@/lib/i693/pdf-page-sections'
import type { PdfTextPlacement } from '@/lib/i693/pdf-overlay-uscis-012025'

/** Place remaining fields on the PDF page (right column) — no separate web form panel. */
export function buildAutoPlacementsForPage(pageIndex: number): PdfTextPlacement[] {
  const fields = getPanelFieldsForPdfPage(pageIndex)
  if (!fields.length) return []

  return fields.map((field, index) => placementForField(pageIndex, field, index))
}

function placementForField(
  pageIndex: number,
  field: I693FieldDef,
  index: number
): PdfTextPlacement {
  const isLong = field.type === 'textarea'
  const rowH = isLong ? 32 : 18
  const y = 680 - index * rowH
  return {
    key: field.key,
    page: pageIndex,
    x: 54,
    y: Math.max(48, y),
    size: isLong ? 7 : 8,
    width: isLong ? 504 : 240,
  }
}

export function buildAllAutoPlacements(): PdfTextPlacement[] {
  const out: PdfTextPlacement[] = []
  for (let page = 0; page < 14; page++) {
    out.push(...buildAutoPlacementsForPage(page))
  }
  return out
}
