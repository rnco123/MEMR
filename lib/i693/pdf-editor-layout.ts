import { I693_UI_SECTIONS } from '@/lib/i693/field-sections'
import { buildApplicantHeaderMirrors } from '@/lib/i693/pdf-overlay-mirrors'
import {
  I693_OVERLAY_CHAR_CELLS,
  I693_OVERLAY_MARKS,
  I693_OVERLAY_TEXT,
  type PdfCharCellPlacement,
  type PdfMarkPlacement,
  type PdfTextPlacement,
} from '@/lib/i693/pdf-overlay-uscis-012025'

export const PDF_PAGE_WIDTH = 612
export const PDF_PAGE_HEIGHT = 792

export const PDF_FIELD_BOX_HEIGHT = 14

const MIRROR = buildApplicantHeaderMirrors()

export const PDF_ALL_TEXT_PLACEMENTS: PdfTextPlacement[] = [
  ...I693_OVERLAY_TEXT,
  ...MIRROR.text,
]

export const PDF_ALL_CHAR_CELLS: PdfCharCellPlacement[] = [
  ...I693_OVERLAY_CHAR_CELLS,
  ...MIRROR.charCells,
]

export type PdfEditorField =
  | ({ kind: 'text' } & PdfTextPlacement & { label: string })
  | ({ kind: 'mark' } & PdfMarkPlacement & { label: string })
  | ({ kind: 'char_cells' } & PdfCharCellPlacement & { label: string })

export function labelForOverlayKey(key: string): string {
  for (const section of I693_UI_SECTIONS) {
    const f = section.fields.find((x) => x.key === key)
    if (f) return f.label
  }
  return key.replace(/\./g, ' › ')
}

export function pdfPointToCssTop(
  boxTopFromBottom: number,
  fieldHeight = PDF_FIELD_BOX_HEIGHT
): number {
  return PDF_PAGE_HEIGHT - boxTopFromBottom - fieldHeight
}

/** pdf-lib draws at baseline; sit text on the bottom rule of the fill box. */
export function pdfBoxTopToTextBaseline(boxTopFromBottom: number, fontSize = 9): number {
  void fontSize
  return boxTopFromBottom - 3
}

export const PDF_EDITOR_FIELDS: PdfEditorField[] = [
  ...PDF_ALL_TEXT_PLACEMENTS.map((p) => ({
    kind: 'text' as const,
    ...p,
    label: labelForOverlayKey(p.key),
  })),
  ...PDF_ALL_CHAR_CELLS.map((c) => ({
    kind: 'char_cells' as const,
    ...c,
    label: labelForOverlayKey(c.key),
  })),
  ...I693_OVERLAY_MARKS.map((m) => ({ kind: 'mark' as const, ...m, label: labelForOverlayKey(m.key) })),
]

export const PDF_EDITOR_PAGE_INDICES = [
  ...new Set(PDF_EDITOR_FIELDS.map((f) => f.page)),
].sort((a, b) => a - b)

export function formatDateForPdfDisplay(iso: string): string {
  const s = iso.trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return `${m[2]}/${m[3]}/${m[1]}`
  return s
}

export function parseDateFromPdfDisplay(display: string): string {
  const t = display.trim()
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (m) {
    const mm = (m[1] ?? '').padStart(2, '0')
    const dd = (m[2] ?? '').padStart(2, '0')
    const yyyy = m[3] ?? ''
    return `${yyyy}-${mm}-${dd}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t.slice(0, 10)
  return t
}
