/**
 * Passthrough storage for every AcroForm widget value (full PDF field name → string).
 * Keeps PDF-editor input for fields without a semantic mapping (e.g. TB sputum tables).
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { I693FormData } from '@/lib/i693/types'
import { widgetFieldIndex } from '@/lib/i693/pdf-widget-map'

type FieldEntry = {
  id?: string
  value?: string
  checkBox?: boolean
}

/** Stable key for multi-instance fields (pdf.js may omit [n] on the object key). */
export function pdfWidgetStorageKey(fieldName: string, index: number, instanceCount: number): string {
  if (/\[\d+\]\s*$/.test(fieldName)) return fieldName
  if (instanceCount > 1) return `${fieldName}[${index}]`
  return fieldName
}

function isCheckedValue(val: string): boolean {
  return val === 'On' || val === 'Yes' || val === 'true'
}

/** Read all non-empty widget values from pdf.js annotation storage. */
export async function extractPdfWidgetValues(
  pdf: PDFDocumentProxy
): Promise<Record<string, string>> {
  const fieldObjects = await pdf.getFieldObjects()
  const out: Record<string, string> = {}
  if (!fieldObjects) return out

  for (const [fieldName, entries] of Object.entries(fieldObjects)) {
    const list = (entries ?? []) as FieldEntry[]
    for (let index = 0; index < list.length; index++) {
      const entry = list[index]
      if (!entry?.id) continue
      const raw = pdf.annotationStorage.getRawValue(entry.id) as { value?: string } | undefined
      const val = (raw?.value ?? entry.value ?? '').toString().trim()
      if (!val || val === 'Off') continue
      const key = pdfWidgetStorageKey(fieldName, index, list.length)
      out[key] = val
    }
  }

  return out
}

/** Write stored raw values into pdf.js before rendering the annotation layer. */
export async function applyPdfWidgetValues(
  pdf: PDFDocumentProxy,
  values: Record<string, string> | undefined
): Promise<void> {
  if (!values || Object.keys(values).length === 0) return

  const fieldObjects = await pdf.getFieldObjects()
  if (!fieldObjects) return

  for (const [fieldName, entries] of Object.entries(fieldObjects)) {
    const list = (entries ?? []) as FieldEntry[]
    for (let index = 0; index < list.length; index++) {
      const key = pdfWidgetStorageKey(fieldName, index, list.length)
      const val = values[key]
      if (val == null || val === '') continue

      const entry = list[index]
      if (!entry?.id) continue

      if (isCheckedValue(val)) {
        pdf.annotationStorage.setValue(entry.id, { value: 'On', exportValue: 'Yes' })
      } else {
        pdf.annotationStorage.setValue(entry.id, { value: val, formattedValue: val })
      }
    }
  }
}

export function mergePdfWidgetValuesIntoForm(
  data: I693FormData,
  extracted: Record<string, string>
): void {
  if (Object.keys(extracted).length === 0) return
  data.pdf_widget_values = { ...(data.pdf_widget_values ?? {}), ...extracted }
}

type MupdfWidget = {
  getName: () => string
  isCheckbox: () => boolean
  isText: () => boolean
  isComboBox: () => boolean
  isListBox: () => boolean
  getValue: () => string
  toggle: () => void
  setTextValue: (t: string) => void
  setChoiceValue: (t: string) => void
  getMaxLen: () => number
}

/** Fill a single widget from raw storage (used when no semantic mapping ran). */
export function fillMupdfWidgetFromRaw(
  widget: MupdfWidget,
  fullName: string,
  values: Record<string, string> | undefined,
  filled: string[]
): boolean {
  const val = rawValueForWidget(values, fullName)
  if (val == null || val === '') return false

  if (widget.isCheckbox()) {
    const on = widget.getValue() === 'Yes' || widget.getValue() === 'On'
    const want = isCheckedValue(val)
    if (want && !on) widget.toggle()
    else if (!want && on) widget.toggle()
    filled.push(`pdf_widget_values:${fullName}`)
    return true
  }

  if (widget.isText()) {
    widget.setTextValue(val.slice(0, widget.getMaxLen() || 500))
    filled.push(`pdf_widget_values:${fullName}`)
    return true
  }

  if (widget.isComboBox() || widget.isListBox()) {
    widget.setChoiceValue(val)
    filled.push(`pdf_widget_values:${fullName}`)
    return true
  }

  return false
}

/** Resolve raw key for a MuPDF widget (name usually includes [index]). */
export function rawValueForWidget(
  values: Record<string, string> | undefined,
  fullName: string
): string | undefined {
  if (!values) return undefined
  if (values[fullName]) return values[fullName]
  const base = fullName.replace(/\[\d+\]\s*$/, '')
  const idx = widgetFieldIndex(fullName)
  const alt = pdfWidgetStorageKey(base, idx, 2)
  return values[alt] ?? values[base]
}
