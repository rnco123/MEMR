import type { I693FormData } from '@/lib/i693/types'
import { flatFormValues } from '@/lib/i693/pdf-acroform-map'
import { formatDateForPdfDisplay } from '@/lib/i693/pdf-editor-layout'
import { getNestedValue } from '@/lib/i693/field-sections'
import { readSlottedValue } from '@/lib/i693/pdf-field-slots'
import { formatI693WidgetValue } from '@/lib/i693/pdf-field-formatters'
import {
  isVaccinationTableWidget,
  vaccinationWidgetValue,
} from '@/lib/i693/vaccination-grid-map'
import {
  WIDGET_CHECKBOX_BINDINGS,
  WIDGET_STREET_IN_CARE_OF_INDEX,
  WIDGET_TEXT_TO_KEY,
  isIgnoredWidget,
  widgetFieldIndex,
  widgetShortName,
} from '@/lib/i693/pdf-widget-map'
import { openI693Pdf } from '@/lib/i693/mupdf-template'
import { fillMupdfWidgetFromRaw } from '@/lib/i693/pdf-widget-values'

type MupdfSaveBuffer = {
  asUint8Array?: () => Uint8Array
  constructor?: { name?: string }
}

function assertPdfHeader(bytes: Uint8Array): void {
  const header = new TextDecoder().decode(bytes.slice(0, 8))
  if (!header.startsWith('%PDF-')) {
    throw new Error(`Invalid PDF generated. Header was: ${JSON.stringify(header)}`)
  }
}

function saveBufferToPdfBytes(buf: Uint8Array | MupdfSaveBuffer): Uint8Array {
  if (buf instanceof Uint8Array) {
    assertPdfHeader(buf)
    return buf
  }

  if (typeof buf.asUint8Array === 'function') {
    const bytes = buf.asUint8Array()
    assertPdfHeader(bytes)
    return new Uint8Array(bytes)
  }

  const typeName = buf?.constructor?.name ?? typeof buf
  throw new Error(`Unsupported MuPDF saveToBuffer() result: ${typeName}`)
}

function valueForKey(data: I693FormData, key: string): string {
  const flat = flatFormValues(data)
  if (key in flat) return flat[key] ?? ''
  const root = data as unknown as Record<string, unknown>
  const nested = getNestedValue(root, key)
  if (nested == null || nested === '') return ''
  if (typeof nested === 'boolean') return nested ? 'Yes' : 'No'
  return String(nested).trim()
}

function fillVaccinationWidget(
  widget: {
    isCheckbox: () => boolean
    isText: () => boolean
    isComboBox: () => boolean
    isListBox: () => boolean
    getValue: () => string
    toggle: () => void
    setTextValue: (t: string) => void
    setChoiceValue: (t: string) => void
    getMaxLen: () => number
  },
  data: I693FormData,
  short: string,
  idx: number,
  filled: string[]
): boolean {
  if (!isVaccinationTableWidget(short)) return false

  const val = vaccinationWidgetValue(data, short, idx)
  if (val === null) return true
  if (typeof val === 'boolean') {
    if (!widget.isCheckbox()) return true
    const on = widget.getValue() === 'Yes' || widget.getValue() === 'On'
    if (val && !on) {
      widget.toggle()
      filled.push(`vaccination_grid:${short}`)
    } else if (!val && on) {
      widget.toggle()
    }
    return true
  }

  const text = String(val)
  if (!text) return true

  if (widget.isText()) {
    widget.setTextValue(text.slice(0, widget.getMaxLen() || 500))
    filled.push(`vaccination_grid:${short}`)
  } else if (widget.isComboBox() || widget.isListBox()) {
    widget.setChoiceValue(text)
    filled.push(`vaccination_grid:${short}`)
  }
  return true
}

function displayForWidget(
  data: I693FormData,
  mapping: { key: string; slot?: string; format?: 'date' },
  widgetIndex: number,
  short: string
): string {
  const root = data as unknown as Record<string, unknown>
  if (short === 'Pt1Line2_StreetNumberName' && widgetIndex === WIDGET_STREET_IN_CARE_OF_INDEX) {
    return valueForKey(data, 'applicant.in_care_of')
  }
  if (mapping.slot) {
    return readSlottedValue(root, {
      key: mapping.key,
      slot: mapping.slot as 'name_family' | 'name_given' | 'phone_day' | 'phone_mobile',
    })
  }
  const raw = valueForKey(data, mapping.key)
  const normalized = formatI693WidgetValue(mapping.key, raw)
  if (!normalized) return ''
  if (mapping.format === 'date' && raw) return formatDateForPdfDisplay(raw)
  return mapping.format === 'date' ? formatDateForPdfDisplay(normalized) : normalized
}

/** Fill official USCIS AcroForm widgets in-place (pixel-perfect export). */
export async function fillAcroformI693PdfMupdf(
  templatePath: string,
  data: I693FormData
): Promise<{ bytes: Uint8Array; filled: string[] }> {
  const doc = await openI693Pdf(templatePath)
  const filled: string[] = []

  for (let pageIndex = 0; pageIndex < doc.countPages(); pageIndex++) {
    const page = doc.loadPage(pageIndex)
    for (const widget of page.getWidgets()) {
      const fullName = widget.getName()
      if (isIgnoredWidget(fullName)) continue

      const short = widgetShortName(fullName)
      const idx = widgetFieldIndex(fullName)

      if (fillVaccinationWidget(widget, data, short, idx, filled)) continue

      if (fillMupdfWidgetFromRaw(widget, fullName, data.pdf_widget_values, filled)) continue

      const cb = WIDGET_CHECKBOX_BINDINGS.find((b) => b.widget === short && b.index === idx)
      if (cb && widget.isCheckbox()) {
        const want = valueForKey(data, cb.key) === cb.when
        const on = widget.getValue() === 'Yes' || widget.getValue() === 'On'
        if (want && !on) {
          widget.toggle()
          filled.push(`${cb.key}:${cb.when}`)
        } else if (!want && on) {
          widget.toggle()
        }
        continue
      }

      const mapping = WIDGET_TEXT_TO_KEY[short]
      if (!mapping) {
        fillMupdfWidgetFromRaw(widget, fullName, data.pdf_widget_values, filled)
        continue
      }

      const text = displayForWidget(data, mapping, idx, short)
      if (!text) {
        fillMupdfWidgetFromRaw(widget, fullName, data.pdf_widget_values, filled)
        continue
      }

      if (widget.isText()) {
        widget.setTextValue(text.slice(0, widget.getMaxLen() || 500))
        filled.push(mapping.slot ? `${mapping.key}:${mapping.slot}` : mapping.key)
      } else if (widget.isComboBox() || widget.isListBox()) {
        widget.setChoiceValue(text)
        filled.push(mapping.key)
      }
    }
  }

  const buf = doc.saveToBuffer({ compress: true })
  const bytes = saveBufferToPdfBytes(buf as Uint8Array | MupdfSaveBuffer)
  return { bytes, filled: [...new Set(filled)] }
}
