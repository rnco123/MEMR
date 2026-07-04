import type { PDFDocumentProxy } from 'pdfjs-dist'
import { readSlottedValue, writeSlottedValue } from '@/lib/i693/pdf-field-slots'
import { formatDateForPdfDisplay, parseDateFromPdfDisplay } from '@/lib/i693/pdf-editor-layout'
import type { I693FormData } from '@/lib/i693/types'
import { PDF_FIELD_REGISTRY } from '@/lib/i693/pdf-field-registry'
import { getNestedValue, setNestedValue } from '@/lib/i693/field-sections'
import { formatI693WidgetValue } from '@/lib/i693/pdf-field-formatters'
import {
  applyVaccinationWidgetToGrid,
  isVaccinationTableWidget,
  parseVaccinationWidget,
  vaccinationWidgetValue,
} from '@/lib/i693/vaccination-grid-map'
import { mergeAcceptedI693AiDraft } from '@/lib/i693/supporting-documents/merge-draft'
import { isI693CombFieldKey } from '@/lib/i693/pdf-comb-fields'
import { widgetFieldIndex, widgetShortName } from '@/lib/i693/pdf-widget-map'
import {
  applyPdfWidgetValues,
  extractPdfWidgetValues,
  mergePdfWidgetValuesIntoForm,
} from '@/lib/i693/pdf-widget-values'

function valueForBinding(data: I693FormData, b: (typeof PDF_FIELD_REGISTRY)[number]): string {
  const root = data as unknown as Record<string, unknown>
  if (b.slot) {
    return readSlottedValue(root, { key: b.key, slot: b.slot })
  }
  const raw = getNestedValue(root, b.key)
  if (raw == null || raw === '') return ''
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No'
  const normalized = formatI693WidgetValue(b.key, String(raw))
  if (!normalized) return ''
  if (b.format === 'date') return formatDateForPdfDisplay(normalized)
  return normalized
}

async function applyVaccinationFields(
  pdf: PDFDocumentProxy,
  data: I693FormData
): Promise<void> {
  const fieldObjects = await pdf.getFieldObjects()
  if (!fieldObjects) return

  for (const [pdfFieldName, rawEntries] of Object.entries(fieldObjects)) {
    const short = widgetShortName(pdfFieldName)
    if (!isVaccinationTableWidget(short) && short !== 'Pt10Line1_CompleteSeries') continue

    const entries = (rawEntries ?? []) as { id?: string }[]
    const nameIdx = widgetFieldIndex(pdfFieldName)
    for (let i = 0; i < entries.length; i++) {
      const idx = entries.length > 1 ? i : nameIdx
      const id = entries[i]?.id
      if (!id) continue

      const val = vaccinationWidgetValue(data, short, idx)
      if (typeof val === 'boolean') {
        if (!val) continue
        pdf.annotationStorage.setValue(id, { value: 'On', exportValue: 'Yes' })
        continue
      }

      const text = val == null ? '' : String(val)
      if (!text) continue
      pdf.annotationStorage.setValue(id, { value: text, formattedValue: text })
    }
  }
}

async function extractVaccinationFields(
  pdf: PDFDocumentProxy,
  data: I693FormData
): Promise<void> {
  const fieldObjects = await pdf.getFieldObjects()
  if (!fieldObjects) return

  for (const [pdfFieldName, entries] of Object.entries(fieldObjects)) {
    const short = widgetShortName(pdfFieldName)
    const parsed = parseVaccinationWidget(short)
    const isCompleteMulti = short === 'Pt10Line1_CompleteSeries'
    if (!parsed && !isCompleteMulti) continue

    const idx = widgetFieldIndex(pdfFieldName)
    const entryList = entries as { id?: string; value?: string; checkBox?: boolean }[] | undefined
    const entry = entryList?.[idx] ?? entryList?.[0]
    if (!entry?.id) continue

    const raw = pdf.annotationStorage.getRawValue(entry.id) as { value?: string } | undefined
    const val = (raw?.value ?? entry.value ?? '').toString().trim()
    const checked = val === 'On' || val === 'Yes' || entry.checkBox === true

    // pdf.js reports unchecked boxes as "Off" — do not clear pre-filled waiver flags.
    if (val === 'Off' || (!checked && !val)) continue
    applyVaccinationWidgetToGrid(data, short, val, checked, idx)
  }
}

/** Push MEMR form values into pdf.js annotation storage before rendering widgets. */
export async function applyI693FormToPdfDocument(
  pdf: PDFDocumentProxy,
  data: I693FormData
): Promise<void> {
  const fieldObjects = await pdf.getFieldObjects()
  if (!fieldObjects) return

  for (const binding of PDF_FIELD_REGISTRY) {
    if (binding.key === 'vaccination_grid') continue

    if (binding.kind === 'mark') {
      const want = valueForBinding(data, binding) === binding.when
      if (!want) continue
      const entries = fieldObjects[binding.pdfFieldName] as { id?: string }[] | undefined
      const id = entries?.[0]?.id
      if (!id) continue
      pdf.annotationStorage.setValue(id, { value: 'On', exportValue: binding.when })
      continue
    }

    const text = valueForBinding(data, binding)
    if (!text) continue
    const entries = fieldObjects[binding.pdfFieldName] as { id?: string }[] | undefined
    const idx = widgetFieldIndex(binding.pdfFieldName)
    const id = entries?.[idx]?.id ?? entries?.[0]?.id
    if (!id) continue
    pdf.annotationStorage.setValue(id, { value: text, formattedValue: text })
  }

  await applyVaccinationFields(pdf, data)
  await applyPdfWidgetValues(pdf, data.pdf_widget_values)
}

/** Copy embedded AcroForm /V values into pdf.js annotationStorage (preview/export PDFs). */
export async function hydrateAnnotationStorageFromPdfWidgets(
  pdf: PDFDocumentProxy
): Promise<void> {
  const fieldObjects = await pdf.getFieldObjects()
  if (!fieldObjects) return

  for (const entries of Object.values(fieldObjects)) {
    const list = (entries ?? []) as {
      id?: string
      value?: string
      checkBox?: boolean
    }[]
    for (const entry of list) {
      if (!entry?.id) continue
      const val = (entry.value ?? '').toString().trim()
      const checked = entry.checkBox === true || val === 'On' || val === 'Yes'
      if (checked) {
        pdf.annotationStorage.setValue(entry.id, { value: 'On', exportValue: 'Yes' })
      } else if (val && val !== 'Off') {
        pdf.annotationStorage.setValue(entry.id, { value: val, formattedValue: val })
      }
    }
  }
}

/** Read pdf.js annotation storage back into MEMR form shape. */
export type ExtractI693Options = {
  /**
   * When true, the reviewed PDF is authoritative: text a user cleared is saved
   * as empty and a radio/checkbox group they unchecked is cleared. When false
   * (default), empty widgets keep any pre-filled/default value already present.
   */
  respectUserClears?: boolean
}

/**
 * Which mark (radio/checkbox) keys should be cleared: those that have at least
 * one widget present but none checked. Keeping it pure keeps the radio-group
 * logic (e.g. switching sex male→female must not blank the field) testable.
 */
export function markKeysToClear(
  present: ReadonlySet<string>,
  checked: ReadonlySet<string>
): string[] {
  const clears: string[] = []
  for (const key of present) {
    if (!checked.has(key)) clears.push(key)
  }
  return clears
}

export async function extractI693FormFromPdfDocument(
  pdf: PDFDocumentProxy,
  base: I693FormData,
  options: ExtractI693Options = {}
): Promise<I693FormData> {
  const respectUserClears = options.respectUserClears === true
  const fieldObjects = await pdf.getFieldObjects()
  const next = structuredClone(base) as I693FormData
  const root = next as unknown as Record<string, unknown>
  if (!fieldObjects) return next

  // Track mark groups so an unchecked radio/checkbox group can be cleared
  // without a sibling widget in the same group wiping the checked value.
  const markKeysPresent = new Set<string>()
  const markKeysChecked = new Set<string>()

  for (const binding of PDF_FIELD_REGISTRY) {
    if (binding.key === 'vaccination_grid') continue

    const entries = fieldObjects[binding.pdfFieldName] as
      | { id?: string; value?: string }[]
      | undefined
    const idx = widgetFieldIndex(binding.pdfFieldName)
    const entry = entries?.[idx] ?? entries?.[0]
    if (!entry?.id) continue
    const raw = pdf.annotationStorage.getRawValue(entry.id) as { value?: string } | undefined
    const val = (raw?.value ?? entry.value ?? '').toString().trim()

    if (binding.kind === 'mark') {
      markKeysPresent.add(binding.key)
      if (val === 'On' || val === 'Yes' || val === binding.when) {
        markKeysChecked.add(binding.key)
        setNestedValue(root, binding.key, binding.when)
      }
      continue
    }

    if (isI693CombFieldKey(binding.key)) continue

    if (!val) {
      // Empty text widget: only honor the clear when the reviewed PDF is
      // authoritative; otherwise leave the pre-filled/default value in place.
      if (respectUserClears) {
        if (binding.slot) {
          writeSlottedValue(root, { key: binding.key, slot: binding.slot }, '')
        } else {
          setNestedValue(root, binding.key, '')
        }
      }
      continue
    }

    const parsedRaw = binding.format === 'date' ? parseDateFromPdfDisplay(val) : val
    const parsed = binding.format === 'date'
      ? parsedRaw
      : formatI693WidgetValue(binding.key, parsedRaw)
    if (binding.slot) {
      writeSlottedValue(root, { key: binding.key, slot: binding.slot }, parsed)
    } else {
      setNestedValue(root, binding.key, parsed)
    }
  }

  if (respectUserClears) {
    for (const key of markKeysToClear(markKeysPresent, markKeysChecked)) {
      setNestedValue(root, key, null)
    }
  }

  await extractVaccinationFields(pdf, next)
  mergePdfWidgetValuesIntoForm(next, await extractPdfWidgetValues(pdf))
  return next
}

/** Read pdf.js fields without erasing pre-built clinic defaults on unchecked widgets. */
export async function extractI693FormFromPdfDocumentPreserving(
  pdf: PDFDocumentProxy,
  base: I693FormData
): Promise<I693FormData> {
  const extracted = await extractI693FormFromPdfDocument(pdf, base)
  return mergeAcceptedI693AiDraft(base, extracted)
}

/**
 * Capture the user's reviewed edits: the PDF is authoritative, so edited values,
 * cleared text, and toggled radios/checkboxes all persist. Fields with no widget
 * in the form fall back to the existing form data. Use this for manual saves and
 * edit syncs — not for merging an AI draft (see mergeAcceptedI693AiDraft).
 */
export async function extractI693FormFromPdfDocumentRespectingUserEdits(
  pdf: PDFDocumentProxy,
  base: I693FormData
): Promise<I693FormData> {
  return extractI693FormFromPdfDocument(pdf, base, { respectUserClears: true })
}
