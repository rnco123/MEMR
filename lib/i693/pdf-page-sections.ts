import { I693_UI_SECTIONS, type I693FieldDef } from '@/lib/i693/field-sections'
import {
  I693_OVERLAY_CHAR_CELLS,
  I693_OVERLAY_MARKS,
  I693_OVERLAY_TEXT,
} from '@/lib/i693/pdf-overlay-uscis-012025'

/**
 * Which I693_UI_SECTIONS entries apply to each PDF page (0-based).
 * Edition 01/20/25 — pages without PDF overlay still get a field panel below the scan.
 */
export const I693_PDF_PAGE_SECTION_INDICES: Record<number, number[]> = {
  0: [1, 2],
  1: [4, 5],
  2: [4, 5],
  3: [6],
  4: [6, 12],
  5: [7, 8, 9],
  6: [7, 8, 9, 10],
  7: [7, 8, 9, 10],
  8: [9, 10, 11],
  9: [10, 11],
  10: [10, 11],
  11: [9, 10, 11, 12],
  12: [9, 10],
  13: [11],
}

/** Keys with hand-calibrated on-PDF positions (excludes auto-placed fallback fields). */
function overlayKeysOnPage(pageIndex: number): Set<string> {
  const keys = new Set<string>()
  for (const f of I693_OVERLAY_TEXT) {
    if (f.page === pageIndex) keys.add(f.key)
  }
  for (const f of I693_OVERLAY_CHAR_CELLS) {
    if (f.page === pageIndex) keys.add(f.key)
  }
  for (const f of I693_OVERLAY_MARKS) {
    if (f.page === pageIndex) keys.add(f.key)
  }
  return keys
}

/** Form fields to show in the page panel (excludes keys already on the PDF overlay). */
export function getPanelFieldsForPdfPage(pageIndex: number): I693FieldDef[] {
  const sectionIndices = I693_PDF_PAGE_SECTION_INDICES[pageIndex]
  if (!sectionIndices?.length) return []

  const overlayKeys = overlayKeysOnPage(pageIndex)
  const out: I693FieldDef[] = []
  const seen = new Set<string>()

  for (const si of sectionIndices) {
    const section = I693_UI_SECTIONS[si]
    if (!section) continue
    for (const field of section.fields) {
      if (overlayKeys.has(field.key) || seen.has(field.key)) continue
      seen.add(field.key)
      out.push(field)
    }
  }
  return out
}

export function pdfPageHasOverlayFields(pageIndex: number): boolean {
  return overlayKeysOnPage(pageIndex).size > 0
}
