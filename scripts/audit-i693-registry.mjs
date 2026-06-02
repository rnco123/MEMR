import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PDF_FIELD_REGISTRY } from '../lib/i693/pdf-field-registry.ts'
import {
  WIDGET_CHECKBOX_BINDINGS,
  WIDGET_STREET_IN_CARE_OF_INDEX,
  WIDGET_TEXT_TO_KEY,
  isIgnoredWidget,
  widgetFieldIndex,
  widgetShortName,
} from '../lib/i693/pdf-widget-map.ts'
import { I693_ACROFORM_MAP } from '../lib/i693/pdf-acroform-map.ts'
import { isVaccinationTableWidget } from '../lib/i693/vaccination-grid-map.ts'

const TEMPLATE_PATH = 'public/forms/i-693-template.pdf'
const REPORT_DIR = 'reports'
const HEADER_MIRROR_WIDGETS = new Set([
  'Pt1Line1a_FamilyName',
  'Pt1Line1b_GivenName',
  'Pt1Line1c_MiddleName',
  'Pt1Line3e_AlienNumber',
])

function widgetType(annotation) {
  if (annotation.fieldType === 'Tx') return 'text'
  if (annotation.fieldType === 'Ch') return annotation.combo ? 'dropdown' : 'listbox'
  if (annotation.fieldType === 'Btn') return annotation.radioButton ? 'radio' : 'checkbox'
  return 'other'
}

function mappingForWidget(widget) {
  const checkbox = WIDGET_CHECKBOX_BINDINGS.find(
    (binding) => binding.widget === widget.shortName && binding.index === widget.index
  )
  if (checkbox) {
    return {
      source: 'pdf-widget-map:checkbox',
      internalKey: checkbox.key,
      when: checkbox.when,
      formatter: null,
      parser: null,
    }
  }

  if (
    widget.shortName === 'Pt1Line2_StreetNumberName' &&
    widget.index === WIDGET_STREET_IN_CARE_OF_INDEX
  ) {
    return {
      source: 'pdf-widget-map:special-case',
      internalKey: 'applicant.in_care_of',
      when: null,
      formatter: null,
      parser: null,
    }
  }

  if (isVaccinationTableWidget(widget.shortName) || widget.shortName === 'Pt10Line1_CompleteSeries') {
    return {
      source: 'vaccination-grid-map',
      internalKey: 'vaccination_grid',
      when: null,
      formatter: null,
      parser: null,
    }
  }

  if (!['text', 'dropdown', 'listbox'].includes(widget.type)) return null

  const text = WIDGET_TEXT_TO_KEY[widget.shortName]
  if (!text) return null
  return {
    source: 'pdf-widget-map:text',
    internalKey: text.key,
    slot: text.slot ?? null,
    when: null,
    formatter: text.format ?? null,
    parser: text.format ?? null,
  }
}

function countByType(widgets) {
  return widgets.reduce(
    (counts, widget) => {
      counts[widget.type] = (counts[widget.type] ?? 0) + 1
      return counts
    },
    { text: 0, checkbox: 0, radio: 0, dropdown: 0, listbox: 0, other: 0 }
  )
}

function markdownTable(rows) {
  return [
    '| Type | Total | Mapped | Missing |',
    '| ---- | -----: | -----: | ------: |',
    ...rows.map((row) => `| ${row.type} | ${row.total} | ${row.mapped} | ${row.missing} |`),
  ].join('\n')
}

function listSection(title, rows) {
  if (rows.length === 0) return `## ${title}\n\nNone.\n`
  return [
    `## ${title}`,
    '',
    '| Page | Type | Short Name | Full PDF Field Name |',
    '| ----: | ---- | ---------- | ------------------- |',
    ...rows.map((row) => `| ${row.pageNumber} | ${row.type} | \`${row.shortName}\` | \`${row.fullName}\` |`),
    '',
  ].join('\n')
}

const pdf = await getDocument({
  data: new Uint8Array(readFileSync(TEMPLATE_PATH)),
  useSystemFonts: true,
}).promise

const widgets = []
for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
  const page = await pdf.getPage(pageNumber)
  const annotations = await page.getAnnotations()
  for (const annotation of annotations) {
    if (annotation.subtype !== 'Widget' || !annotation.fieldName) continue

    const fullName = annotation.fieldName
    const shortName = widgetShortName(fullName)
    const index = widgetFieldIndex(fullName)
    const ignored = isIgnoredWidget(fullName)
    const widget = {
      fullName,
      shortName,
      page: pageNumber - 1,
      pageNumber,
      type: widgetType(annotation),
      index,
      exportValue: annotation.exportValue ?? null,
      internalKey: null,
      mirrorGroup:
        pageNumber > 1 && HEADER_MIRROR_WIDGETS.has(shortName) ? 'applicant-header' : null,
      ignored,
      formatter: null,
      parser: null,
      mappedByExport: false,
      mappedByPdfJsRegistry: false,
    }

    const mapping = mappingForWidget(widget)
    if (mapping) {
      widget.internalKey = mapping.internalKey
      widget.formatter = mapping.formatter
      widget.parser = mapping.parser
      widget.slot = mapping.slot ?? null
      widget.when = mapping.when ?? null
      widget.mappingSource = mapping.source
      widget.mappedByExport = true
    }

    widgets.push(widget)
  }
}

const fillableWidgets = widgets.filter((widget) => !widget.ignored)
const registryNames = new Set(PDF_FIELD_REGISTRY.map((binding) => binding.pdfFieldName))
for (const widget of widgets) {
  widget.mappedByPdfJsRegistry = registryNames.has(widget.fullName)
}

const mappedWidgets = fillableWidgets.filter((widget) => widget.mappedByExport)
const unmappedWidgets = fillableWidgets.filter((widget) => !widget.mappedByExport)
const totals = countByType(fillableWidgets)
const mappedTotals = countByType(mappedWidgets)
const missingTotals = countByType(unmappedWidgets)

const coverageRows = ['text', 'checkbox', 'radio', 'dropdown'].map((type) => ({
  type,
  total: totals[type] ?? 0,
  mapped: mappedTotals[type] ?? 0,
  missing: missingTotals[type] ?? 0,
}))

const audit = {
  generatedAt: new Date().toISOString(),
  templatePath: TEMPLATE_PATH,
  pageCount: pdf.numPages,
  totalWidgetsIncludingIgnored: widgets.length,
  ignoredWidgets: widgets.length - fillableWidgets.length,
  totalWidgets: fillableWidgets.length,
  textWidgets: totals.text,
  checkboxWidgets: totals.checkbox,
  dropdownWidgets: totals.dropdown,
  radioWidgets: totals.radio,
  mappedWidgets: mappedWidgets.length,
  unmappedWidgets: unmappedWidgets.length,
  mappingSources: {
    pdfFieldRegistry: {
      bindings: PDF_FIELD_REGISTRY.length,
      mappedWidgets: fillableWidgets.filter((widget) => widget.mappedByPdfJsRegistry).length,
      unmappedWidgets: fillableWidgets.filter((widget) => !widget.mappedByPdfJsRegistry).length,
    },
    pdfWidgetMap: {
      textShortNames: Object.keys(WIDGET_TEXT_TO_KEY).length,
      checkboxBindings: WIDGET_CHECKBOX_BINDINGS.length,
      mappedWidgets: mappedWidgets.length,
      unmappedWidgets: unmappedWidgets.length,
    },
    pdfAcroformMap: {
      entries: Object.keys(I693_ACROFORM_MAP).length,
      note: 'This template is hybrid AcroForm/XFA; pdf-lib reports 0 fields for the installed PDF.',
    },
  },
  coverage: coverageRows,
  unmapped: unmappedWidgets.map((widget) => ({
    fullName: widget.fullName,
    shortName: widget.shortName,
    type: widget.type,
    page: widget.pageNumber,
  })),
}

const proposedRegistry = widgets.map((widget) => ({
  fullName: widget.fullName,
  shortName: widget.shortName,
  page: widget.page,
  type: widget.type,
  index: widget.index,
  exportValue: widget.exportValue,
  internalKey: widget.internalKey,
  mirrorGroup: widget.mirrorGroup,
  ignored: widget.ignored,
  formatter: widget.formatter,
  parser: widget.parser,
  slot: widget.slot ?? null,
  when: widget.when ?? null,
}))

await mkdir(REPORT_DIR, { recursive: true })

await writeFile(
  `${REPORT_DIR}/i693-registry-audit.json`,
  JSON.stringify(audit, null, 2) + '\n',
  'utf8'
)

await writeFile(
  `${REPORT_DIR}/i693-proposed-registry.ts`,
  [
    '/** Proposed single-source I-693 field registry. Generated by npm run audit:i693-registry. */',
    'export const PROPOSED_I693_FIELD_REGISTRY = ',
    JSON.stringify(proposedRegistry, null, 2),
    ' as const',
    '',
  ].join(''),
  'utf8'
)

const unmappedCheckboxes = unmappedWidgets.filter((widget) => widget.type === 'checkbox')
const unmappedDropdowns = unmappedWidgets.filter((widget) => widget.type === 'dropdown')
const topUnmappedText = unmappedWidgets.filter((widget) => widget.type === 'text').slice(0, 100)

await writeFile(
  `${REPORT_DIR}/i693-coverage-report.md`,
  [
    '# I-693 PDF Registry Coverage Report',
    '',
    `Generated: ${audit.generatedAt}`,
    '',
    markdownTable(coverageRows),
    '',
    `Total non-barcode widgets: ${audit.totalWidgets}`,
    `Mapped by effective MuPDF export map: ${audit.mappedWidgets}`,
    `Unmapped by effective MuPDF export map: ${audit.unmappedWidgets}`,
    '',
    listSection('All Unmapped Checkboxes', unmappedCheckboxes),
    listSection('All Unmapped Dropdowns', unmappedDropdowns),
    listSection('Top 100 Unmapped Text Fields', topUnmappedText),
  ].join('\n'),
  'utf8'
)

await writeFile(
  `${REPORT_DIR}/i693-registry-migration-plan.md`,
  [
    '# I-693 Registry Migration Plan',
    '',
    '## Recommendation',
    '',
    'Use `reports/i693-proposed-registry.ts` as the seed for a single source of truth.',
    'Keep full PDF field names for PDF.js annotation storage and MuPDF widget writes, while retaining short names and indexes for compatibility with existing mappings.',
    '',
    '## Migration Steps',
    '',
    '1. Promote the proposed registry into `lib/i693/` after review.',
    '2. Add semantic bindings for every intentionally supported field: `internalKey`, `when`, `slot`, `formatter`, and `parser`.',
    '3. Mark unsupported fields explicitly as `ignored` with a reason instead of letting them be implicitly unmapped.',
    '4. Generate `pdf-field-registry.ts` and `pdf-widget-map.ts` compatibility views from the single registry.',
    '5. Switch `fillAcroformI693PdfMupdf()` to resolve widgets by full name first, falling back to short-name compatibility only during migration.',
    '6. Add CI checks that fail when the PDF fingerprint, widget count, or unmapped-supported count changes.',
    '',
    '## Compatibility Risks',
    '',
    '- Existing saved JSON uses MEMR internal keys, so `internalKey` names must remain stable or be migrated.',
    '- Header mirrors currently render in PDF.js but are skipped by the registry generator; the single registry must model them explicitly.',
    '- USCIS Designer PDFs are hybrid AcroForm/XFA, so pdf-lib field enumeration cannot be treated as authoritative.',
    '- Checkbox groups are exposed as checkboxes, not radio buttons; each export value needs explicit `when` semantics.',
    '- The vaccination table has many repeated fields and needs row/column metadata before it can be safely auto-filled.',
    '',
  ].join('\n'),
  'utf8'
)

console.log(JSON.stringify(audit, null, 2))
