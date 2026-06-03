import type { PDFDocumentProxy } from 'pdfjs-dist'
import { labelForOverlayKey } from '@/lib/i693/pdf-editor-layout'
import { formatI693WidgetValue } from '@/lib/i693/pdf-field-formatters'
import { PDF_FIELD_REGISTRY } from '@/lib/i693/pdf-field-registry'
import { WIDGET_TEXT_TO_KEY, widgetFieldIndex, widgetShortName } from '@/lib/i693/pdf-widget-map'

/** Semantic keys backed by USCIS PDF comb widgets (one char per box). */
export const I693_COMB_FIELD_KEYS = new Set([
  'applicant.a_number',
  'applicant.uscis_online_account',
  'application.receipt_number',
  'uscis_records.receipt_number',
])

export type I693DomCombPlacement = {
  key: string
  page: number
  /** CSS px relative to page box (already scaled by pdf.js viewport). */
  leftPx: number
  topPx: number
  widthPx: number
  heightPx: number
  count: number
  cellWidthPx: number
  mode: 'digit' | 'alnum'
  label: string
  widgetName: string
}

export function isI693CombFieldKey(key: string): boolean {
  return I693_COMB_FIELD_KEYS.has(key)
}

function defaultCombCount(key: string): number {
  if (key === 'applicant.a_number') return 9
  if (key === 'applicant.uscis_online_account') return 12
  return 13
}

function combMode(key: string): 'digit' | 'alnum' {
  return key === 'applicant.a_number' ? 'digit' : 'alnum'
}

function controlFieldName(el: HTMLElement): string {
  const direct =
    el.getAttribute('name') ??
    el.getAttribute('data-element-id') ??
    el.getAttribute('id') ??
    ''
  if (direct) return direct
  const parent = el.closest('.annotationWidget, .textWidgetAnnotation')
  if (parent instanceof HTMLElement) {
    return (
      parent.getAttribute('data-field-name') ??
      parent.getAttribute('title') ??
      parent.id ??
      ''
    )
  }
  return ''
}

/**
 * Align per-cell overlays with pdf.js-rendered comb widgets (MuPDF rects do not match pdf.js layout).
 */
export function discoverCombPlacementsFromLayer(
  formLayer: HTMLElement,
  pageBox: HTMLElement,
  pageNum: number
): I693DomCombPlacement[] {
  const pageRect = pageBox.getBoundingClientRect()
  const seen = new Set<string>()
  const out: I693DomCombPlacement[] = []

  const controls = formLayer.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea'
  )

  for (const el of controls) {
    const name = controlFieldName(el)
    const short = widgetShortName(name)
    const mapping = WIDGET_TEXT_TO_KEY[short]
    if (!mapping || !isI693CombFieldKey(mapping.key)) continue
    if (seen.has(mapping.key)) continue
    seen.add(mapping.key)

    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue

    const count =
      el.maxLength > 0 ? el.maxLength : defaultCombCount(mapping.key)

    el.style.visibility = 'hidden'
    el.style.pointerEvents = 'none'
    el.setAttribute('tabindex', '-1')
    el.setAttribute('aria-hidden', 'true')

    out.push({
      key: mapping.key,
      page: pageNum,
      leftPx: r.left - pageRect.left,
      topPx: r.top - pageRect.top,
      widthPx: r.width,
      heightPx: r.height,
      count,
      cellWidthPx: r.width / count,
      mode: combMode(mapping.key),
      label: labelForOverlayKey(mapping.key),
      widgetName: name,
    })
  }

  return out
}

/** Push full comb string into pdf.js storage (export/preview reads this). */
export async function setCombFieldOnPdfDocument(
  pdf: PDFDocumentProxy,
  key: string,
  rawValue: string
): Promise<void> {
  if (!isI693CombFieldKey(key)) return
  const text = formatI693WidgetValue(key, rawValue)
  const binding = PDF_FIELD_REGISTRY.find((b) => b.key === key && b.kind === 'text')
  if (!binding) return

  const fieldObjects = await pdf.getFieldObjects()
  if (!fieldObjects) return

  const entries = fieldObjects[binding.pdfFieldName] as { id?: string }[] | undefined
  const idx = widgetFieldIndex(binding.pdfFieldName)
  const id = entries?.[idx]?.id ?? entries?.[0]?.id
  if (!id) return

  pdf.annotationStorage.setValue(id, { value: text, formattedValue: text })
}
