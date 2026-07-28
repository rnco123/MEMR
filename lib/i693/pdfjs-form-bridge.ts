import type { PDFDocumentProxy } from 'pdfjs-dist'
import { readSlottedValue, writeSlottedValue } from '@/lib/i693/pdf-field-slots'
import { formatDateForPdfDisplay, parseDateFromPdfDisplay } from '@/lib/i693/pdf-editor-layout'
import type { I693FormData } from '@/lib/i693/types'
import { PDF_FIELD_REGISTRY } from '@/lib/i693/pdf-field-registry'
import { getNestedValue, setNestedValue } from '@/lib/i693/field-sections'
import { formatI693WidgetValue } from '@/lib/i693/pdf-field-formatters'
import { normalizePdfCheckboxExport, wantPdfCheckboxChecked } from '@/lib/i693/pdf-checkbox-utils'
import {
  applyVaccinationWidgetToGrid,
  isVaccinationTableWidget,
  parseVaccinationWidgetAtIndex,
  vaccinationWidgetValue,
} from '@/lib/i693/vaccination-grid-map'
import { mergeAcceptedI693AiDraft } from '@/lib/i693/supporting-documents/merge-draft'
import { isI693CombFieldKey } from '@/lib/i693/pdf-comb-fields'
import { widgetFieldIndex, widgetShortName, checkboxBindingForWidget, isMarkWidgetChecked, pdfExportForCheckbox, WIDGET_CHECKBOX_BINDINGS } from '@/lib/i693/pdf-widget-map'
import {
  applyPdfWidgetValues,
  extractPdfWidgetValues,
  mergePdfWidgetValuesIntoForm,
} from '@/lib/i693/pdf-widget-values'

/**
 * Date widgets kept blank on every prefill — bound to shared keys, they'd get
 * stamped on fill. Only entered by hand when they actually apply:
 *   - Part 6 Line 3: "Dates of Follow-up Examinations, if required" (x3)
 *   - Part 8:        Civil Surgeon's "Date of Signature"
 *   - Part 8 Line 1A: TB "Date Blood Sample Drawn" — QuantiFERON + T-Spot
 * Skipped on both fill and extract; Part 6 Line 2 still carries the exam date.
 */
export const PREFILL_BLANK_WIDGETS = new Set<string>([
  'form1[0].#subform[3].Pt6Line3_DateofExam1[0]',
  'form1[0].#subform[3].Pt6Line3_DateofExam2[0]',
  'form1[0].#subform[3].Pt6Line3_DateofExam3[0]',
  'form1[0].#subform[4].Pt7Line8_DateofSignature[0]',
  'form1[0].#subform[5].Pt8Line1A1_QFDate[0]',
  'form1[0].#subform[5].Pt8Line1A1_TSDate[0]',
])

/**
 * Widgets whose value is managed by the pdf_widget_values passthrough rather
 * than a registry binding. The auto-generated registry maps the civil surgeon
 * Middle Name (unslotted) to the full surgeon_name and would dump "Family Given"
 * into the box; skip the registry binding so the real per-widget middle name
 * fills it and a save doesn't write the box back into surgeon_name.
 */
export const REGISTRY_PASSTHROUGH_WIDGETS = new Set<string>([
  'form1[0].#subform[3].Pt7Line1_MiddleName[0]',
])

function isRegistryUnbound(pdfFieldName: string): boolean {
  return PREFILL_BLANK_WIDGETS.has(pdfFieldName) || REGISTRY_PASSTHROUGH_WIDGETS.has(pdfFieldName)
}

/**
 * Applicant name + A-number repeat in the header band at the top of pages 2+.
 * Those mirror widgets share Part 1 short names but live in other subforms, so
 * the page-1-only registry never fills them — the editor showed a blank header
 * while the preview (overlay) filled it. Map short name → Part 1 form key so we
 * can propagate the value to every mirror widget instance.
 */
const HEADER_MIRROR_KEY_BY_SHORT: Record<string, string> = {
  Pt1Line1a_FamilyName: 'applicant.family_name',
  Pt1Line1b_GivenName: 'applicant.given_name',
  Pt1Line1c_MiddleName: 'applicant.middle_name',
  Pt1Line3e_AlienNumber: 'applicant.a_number',
}

function domWidgetControlName(el: HTMLElement): string {
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

function isEditableTextWidget(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el instanceof HTMLTextAreaElement) return true
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'hidden'].includes(el.type)
}

/** USCIS marks these syphilis follow-up boxes read-only; unlock in the web editor. */
export const FORCE_EDITABLE_WIDGET_SHORT_NAMES = new Set([
  'Pt8Line1B1c_DateNontreponemalTest',
  'Pt7Line1B1c_TiterOne',
])

/** Enable typing in USCIS read-only syphilis text widgets after pdf.js renders. */
export function unlockForceEditablePdfWidgets(formLayer: HTMLElement): void {
  for (const el of formLayer.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea'
  )) {
    if (!isEditableTextWidget(el)) continue
    const short = widgetShortName(domWidgetControlName(el))
    if (!FORCE_EDITABLE_WIDGET_SHORT_NAMES.has(short)) continue
    el.hidden = false
    el.readOnly = false
    el.disabled = false
    el.removeAttribute('readonly')
    el.removeAttribute('disabled')
    el.style.pointerEvents = 'auto'
    el.style.visibility = 'visible'
    el.dataset.i693ForceEditable = 'true'
    if (el.tabIndex < 0) el.tabIndex = 0
  }
}

type PdfPageAnnotation = {
  fieldName?: string
  readOnly?: boolean
  hasOwnCanvas?: boolean
}

/**
 * USCIS marks section (c) syphilis boxes read-only with hasOwnCanvas, so pdf.js
 * hides the real <input> and only paints a static canvas appearance.
 */
export function patchForceEditableAnnotations(annotations: PdfPageAnnotation[]): void {
  for (const annotation of annotations) {
    if (!annotation.fieldName) continue
    if (!FORCE_EDITABLE_WIDGET_SHORT_NAMES.has(widgetShortName(annotation.fieldName))) continue
    annotation.readOnly = false
    annotation.hasOwnCanvas = false
  }
}

/**
 * pdf.js often leaves the repeated applicant header (pages 2+) blank even after
 * annotationStorage is filled. Push Part 1 values into the rendered DOM inputs.
 */
export function syncApplicantHeaderMirrorDom(
  formLayer: HTMLElement,
  data: I693FormData,
  options: { continuationPage?: boolean } = {}
): void {
  const root = data as unknown as Record<string, unknown>
  for (const el of formLayer.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea'
  )) {
    if (!isEditableTextWidget(el)) continue
    const key = HEADER_MIRROR_KEY_BY_SHORT[widgetShortName(domWidgetControlName(el))]
    if (!key || isI693CombFieldKey(key)) continue

    const raw = getNestedValue(root, key)
    const value = raw == null || raw === '' ? '' : formatI693WidgetValue(key, String(raw))

    if (options.continuationPage) {
      el.readOnly = true
      el.tabIndex = -1
    }
    if (el.value !== value) el.value = value
  }
}

/** Fill the repeated applicant header (name + A-number) on every page. */
export function applyApplicantHeaderMirrors(
  pdf: PDFDocumentProxy,
  data: I693FormData,
  fieldObjects: Record<string, unknown>
): void {
  const root = data as unknown as Record<string, unknown>
  for (const [fieldName, rawEntries] of Object.entries(fieldObjects)) {
    const key = HEADER_MIRROR_KEY_BY_SHORT[widgetShortName(fieldName)]
    if (!key) continue
    const raw = getNestedValue(root, key)
    const value = raw == null || raw === '' ? '' : formatI693WidgetValue(key, String(raw))
    if (!value) continue
    for (const entry of (rawEntries ?? []) as { id?: string }[]) {
      if (entry?.id) pdf.annotationStorage.setValue(entry.id, { value, formattedValue: value })
    }
  }
}

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

    const entries = (rawEntries ?? []) as { id?: string; exportValues?: unknown }[]
    const nameIdx = widgetFieldIndex(pdfFieldName)
    for (let i = 0; i < entries.length; i++) {
      const idx = entries.length > 1 ? i : nameIdx
      const entry = entries[i]
      const id = entry?.id
      if (!id) continue

      const val = vaccinationWidgetValue(data, short, idx)
      const isCompleteSeries = short.includes('CompleteSeries')

      if (typeof val === 'boolean' && !isCompleteSeries) {
        const pdfExport = normalizePdfCheckboxExport(entry?.exportValues) ?? 'Yes'
        pdf.annotationStorage.setValue(id, {
          value: val ? 'On' : 'Off',
          exportValue: pdfExport,
        })
        continue
      }

      const text = val == null ? '' : String(val)
      pdf.annotationStorage.setValue(id, { value: text, formattedValue: text })
    }
  }
}

async function extractVaccinationFields(
  pdf: PDFDocumentProxy,
  data: I693FormData,
  respectUserClears: boolean
): Promise<void> {
  const fieldObjects = await pdf.getFieldObjects()
  if (!fieldObjects) return

  const vaccinationFields: string[] = []
  for (const [pdfFieldName, rawEntries] of Object.entries(fieldObjects)) {
    const short = widgetShortName(pdfFieldName)
    if (!isVaccinationTableWidget(short)) continue
    vaccinationFields.push(pdfFieldName)

    const entries = (rawEntries ?? []) as {
      id?: string
      value?: string
      exportValues?: unknown
    }[]
    const nameIdx = widgetFieldIndex(pdfFieldName)
    for (let i = 0; i < entries.length; i++) {
      const idx = entries.length > 1 ? i : nameIdx
      if (!parseVaccinationWidgetAtIndex(short, idx)) continue

      const entry = entries[i]
      if (!entry?.id) continue

      const raw = pdf.annotationStorage.getRawValue(entry.id) as { value?: string } | undefined
      const val = (raw?.value ?? entry.value ?? '').toString().trim()
      const pdfExport = normalizePdfCheckboxExport(entry.exportValues)
      const checked = wantPdfCheckboxChecked(val, pdfExport)

      if (val === 'Off' || (!checked && !val)) {
        if (!respectUserClears) continue
        applyVaccinationWidgetToGrid(data, short, '', false, idx)
        continue
      }
      applyVaccinationWidgetToGrid(data, short, val, checked, idx)
    }
  }
  if (vaccinationFields.length > 0) {
    console.debug('[extractVaccinationFields] Found vaccination fields:', vaccinationFields.length, {
      fields: vaccinationFields.slice(0, 5),
      gridRows: data.vaccination_grid?.length,
    })
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
    if (isRegistryUnbound(binding.pdfFieldName)) continue

    if (binding.kind === 'mark') {
      if (!binding.when) continue
      const want = valueForBinding(data, binding) === binding.when
      if (!want) continue
      const entries = fieldObjects[binding.pdfFieldName] as
        | { id?: string; exportValues?: unknown }[]
        | undefined
      const idx = widgetFieldIndex(binding.pdfFieldName)
      const entry = entries?.[idx] ?? entries?.[0]
      const id = entry?.id
      if (!id) continue
      const cb = checkboxBindingForWidget(widgetShortName(binding.pdfFieldName), idx)
      const exportValue = cb
        ? pdfExportForCheckbox(cb)
        : normalizePdfCheckboxExport(entry?.exportValues) ?? binding.when
      pdf.annotationStorage.setValue(id, { value: 'On', exportValue })
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

  applyApplicantHeaderMirrors(pdf, data, fieldObjects)
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
      exportValues?: unknown
    }[]
    for (const entry of list) {
      if (!entry?.id) continue
      const val = (entry.value ?? '').toString().trim()
      const pdfExport = normalizePdfCheckboxExport(entry.exportValues)
      const checked =
        entry.checkBox === true || wantPdfCheckboxChecked(val, pdfExport)
      if (checked) {
        pdf.annotationStorage.setValue(entry.id, {
          value: 'On',
          exportValue: pdfExport ?? 'Yes',
        })
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
    if (isRegistryUnbound(binding.pdfFieldName)) continue

    const entries = fieldObjects[binding.pdfFieldName] as
      | { id?: string; value?: string; exportValues?: unknown }[]
      | undefined
    const idx = widgetFieldIndex(binding.pdfFieldName)
    const entry = entries?.[idx] ?? entries?.[0]
    if (!entry?.id) continue
    const raw = pdf.annotationStorage.getRawValue(entry.id) as { value?: string } | undefined
    const val = (raw?.value ?? entry.value ?? '').toString().trim()

    if (binding.kind === 'mark') {
      if (!binding.when) continue
      markKeysPresent.add(binding.key)
      const cb = checkboxBindingForWidget(widgetShortName(binding.pdfFieldName), idx)
      const markBinding = cb ?? {
        when: binding.when,
        pdfExport: normalizePdfCheckboxExport(entry.exportValues),
      }
      if (isMarkWidgetChecked(val, markBinding)) {
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

  await extractVaccinationFields(pdf, next, respectUserClears)
  const widgetOptions = { respectUserClears }
  mergePdfWidgetValuesIntoForm(
    next,
    await extractPdfWidgetValues(pdf, widgetOptions),
    widgetOptions
  )
  if (next.vaccination_grid?.length) {
    console.debug('[extractI693FormFromPdfDocument] vaccination_grid extracted:', {
      count: next.vaccination_grid.length,
      sample: next.vaccination_grid[0],
    })
  }
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

/**
 * USCIS single-select groups (Part 6 overall finding, sex, TB class, etc.) share
 * one form key across several checkboxes. Uncheck every sibling when the user
 * selects an option so save/export never keeps multiple ticks.
 */
export async function enforceSingleSelectMarkGroup(
  pdf: PDFDocumentProxy,
  widgetShort: string,
  index: number
): Promise<void> {
  const selected = checkboxBindingForWidget(widgetShort, index)
  if (!selected) return

  const groupSize = WIDGET_CHECKBOX_BINDINGS.filter((b) => b.key === selected.key).length
  if (groupSize < 2) return

  const fieldObjects = await pdf.getFieldObjects()
  if (!fieldObjects) return

  for (const [fieldName, entries] of Object.entries(fieldObjects)) {
    const short = widgetShortName(fieldName)
    const idx = widgetFieldIndex(fieldName)
    const binding = checkboxBindingForWidget(short, idx)
    if (!binding || binding.key !== selected.key) continue
    if (binding.widget === widgetShort && binding.index === index) continue

    const entry = (entries as { id?: string }[] | undefined)?.[0]
    if (!entry?.id) continue
    pdf.annotationStorage.setValue(entry.id, { value: 'Off' })
  }
}
