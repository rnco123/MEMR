import { labelForOverlayKey } from '@/lib/i693/pdf-editor-layout'
import {
  WIDGET_CHECKBOX_BINDINGS,
  WIDGET_STREET_IN_CARE_OF_INDEX,
  WIDGET_TEXT_TO_KEY,
  isIgnoredWidget,
  widgetFieldIndex,
  widgetShortName,
} from '@/lib/i693/pdf-widget-map'
import { isI693CombFieldKey } from '@/lib/i693/pdf-comb-fields'
import { openI693Pdf } from '@/lib/i693/mupdf-template'

export type PdfWidgetEditorField =
  | {
      kind: 'text'
      key: string
      page: number
      x: number
      y: number
      width: number
      height: number
      size?: number
      format?: 'date'
      slot?: 'name_family' | 'name_given' | 'phone_day' | 'phone_mobile'
      label: string
      widgetName: string
    }
  | {
      kind: 'char_cells'
      key: string
      page: number
      x: number
      y: number
      width: number
      height: number
      count: number
      cellWidth: number
      mode?: 'digit' | 'alnum'
      label: string
      widgetName: string
    }
  | {
      kind: 'mark'
      key: string
      page: number
      x: number
      y: number
      width: number
      height: number
      when: string
      label: string
      widgetName: string
    }

/** Repeated header on pages 2–14; edit once on page 1 (index 0). */
const HEADER_MIRROR_WIDGETS = new Set([
  'Pt1Line1a_FamilyName',
  'Pt1Line1b_GivenName',
  'Pt1Line1c_MiddleName',
  'Pt1Line3e_AlienNumber',
])

function rectToPlacement(rect: number[]): { x: number; y: number; width: number; height: number } {
  const x0 = rect[0] ?? 0
  const y0 = rect[1] ?? 0
  const x1 = rect[2] ?? x0
  const y1 = rect[3] ?? y0
  return { x: x0, y: y1, width: x1 - x0, height: y1 - y0 }
}

/** Build editor overlay fields from native PDF widget rectangles. */
export async function extractPdfWidgetEditorFields(
  templatePath: string
): Promise<PdfWidgetEditorField[]> {
  const doc = await openI693Pdf(templatePath)
  const out: PdfWidgetEditorField[] = []

  for (let pageIndex = 0; pageIndex < doc.countPages(); pageIndex++) {
    const page = doc.loadPage(pageIndex)
    for (const widget of page.getWidgets()) {
      const fullName = widget.getName()
      if (isIgnoredWidget(fullName)) continue

      const short = widgetShortName(fullName)
      if (pageIndex > 0 && HEADER_MIRROR_WIDGETS.has(short)) continue

      const idx = widgetFieldIndex(fullName)
      const { x, y, width, height } = rectToPlacement(widget.getRect())

      const cb = WIDGET_CHECKBOX_BINDINGS.find((b) => b.widget === short && b.index === idx)
      if (cb && widget.isCheckbox()) {
        out.push({
          kind: 'mark',
          key: cb.key,
          page: pageIndex,
          x,
          y,
          width,
          height,
          when: cb.when,
          label: labelForOverlayKey(cb.key),
          widgetName: fullName,
        })
        continue
      }

      let mapping = WIDGET_TEXT_TO_KEY[short]
      if (short === 'Pt1Line2_StreetNumberName' && idx === WIDGET_STREET_IN_CARE_OF_INDEX) {
        mapping = { key: 'applicant.in_care_of' }
      }
      if (!mapping) continue

      const maxLen = widget.getMaxLen()
      if (
        widget.isText() &&
        widget.isComb() &&
        maxLen > 0 &&
        isI693CombFieldKey(mapping.key)
      ) {
        out.push({
          kind: 'char_cells',
          key: mapping.key,
          page: pageIndex,
          x,
          y,
          width,
          height,
          count: maxLen,
          cellWidth: width / maxLen,
          mode: mapping.key === 'applicant.a_number' ? 'digit' : 'alnum',
          label: labelForOverlayKey(mapping.key),
          widgetName: fullName,
        })
        continue
      }

      out.push({
        kind: 'text',
        key: mapping.key,
        page: pageIndex,
        x,
        y,
        width,
        height,
        size: height <= 12 ? 8 : 9,
        format: mapping.format,
        slot: mapping.slot,
        label: labelForOverlayKey(mapping.key),
        widgetName: fullName,
      })
    }
  }

  return out
}

export async function templateUsesNativeWidgets(templatePath: string): Promise<boolean> {
  try {
    const n = await extractPdfWidgetEditorFields(templatePath)
    return n.length >= 12
  } catch {
    return false
  }
}
