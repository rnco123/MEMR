/**
 * Generates lib/i693/pdf-field-registry.ts from the official template via pdf.js + widget map.
 */
import { writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  WIDGET_CHECKBOX_BINDINGS,
  WIDGET_STREET_IN_CARE_OF_INDEX,
  WIDGET_TEXT_TO_KEY,
  widgetFieldIndex,
  widgetShortName,
  isIgnoredWidget,
} from '../lib/i693/pdf-widget-map.ts'
import {
  isVaccinationTableWidget,
  parseVaccinationWidget,
} from '../lib/i693/vaccination-grid-map.ts'

const template = 'public/forms/i-693-template.pdf'
const data = new Uint8Array(readFileSync(template))
const pdf = await getDocument({ data, useSystemFonts: true }).promise

const HEADER_MIRROR = new Set([
  'Pt1Line1a_FamilyName',
  'Pt1Line1b_GivenName',
  'Pt1Line1c_MiddleName',
  'Pt1Line3e_AlienNumber',
])

const bindings = []

for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
  const pageIndex = pageNum - 1
  const page = await pdf.getPage(pageNum)
  const annots = await page.getAnnotations()
  for (const a of annots) {
    if (a.subtype !== 'Widget' || !a.fieldName) continue
    if (isIgnoredWidget(a.fieldName)) continue
    const short = widgetShortName(a.fieldName)
    if (pageIndex > 0 && HEADER_MIRROR.has(short)) continue

    const idx = widgetFieldIndex(a.fieldName)
    const cb = WIDGET_CHECKBOX_BINDINGS.find((b) => b.widget === short && b.index === idx)
    if (cb) {
      bindings.push({
        key: cb.key,
        pdfFieldName: a.fieldName,
        page: pageIndex,
        kind: 'mark',
        when: cb.when,
      })
      continue
    }

    if (isVaccinationTableWidget(short) || short === 'Pt10Line1_CompleteSeries') {
      const parsed = parseVaccinationWidget(short)
      const isMark =
        a.fieldType === 'Btn' ||
        (parsed &&
          [
            'contraindicated',
            'insufficientInterval',
            'notAgeAppropriate',
            'immune',
            'historyOfDisease',
            'vaccineGiven',
          ].includes(parsed.field))
      bindings.push({
        key: 'vaccination_grid',
        pdfFieldName: a.fieldName,
        page: pageIndex,
        kind: isMark ? 'mark' : 'text',
      })
      continue
    }

    let mapping = WIDGET_TEXT_TO_KEY[short]
    if (short === 'Pt1Line2_StreetNumberName' && idx === WIDGET_STREET_IN_CARE_OF_INDEX) {
      mapping = { key: 'applicant.in_care_of' }
    }
    if (!mapping) continue

    bindings.push({
      key: mapping.key,
      pdfFieldName: a.fieldName,
      page: pageIndex,
      kind: a.fieldType === 'Btn' ? 'mark' : 'text',
      slot: mapping.slot,
      format: mapping.format,
    })
  }
}

const unique = new Map()
for (const b of bindings) {
  unique.set(`${b.page}:${b.pdfFieldName}`, b)
}
const list = [...unique.values()].sort((a, b) => a.page - b.page || a.key.localeCompare(b.key))

const out = `/** Auto-generated — npm run generate:i693-pdf-registry */
import type { PdfFieldBinding } from '@/lib/i693/pdf-field-registry-types'

export const PDF_FIELD_REGISTRY: PdfFieldBinding[] = ${JSON.stringify(list, null, 2)}
`

await writeFile('lib/i693/pdf-field-registry.ts', out, 'utf8')
console.log('Wrote', list.length, 'bindings to lib/i693/pdf-field-registry.ts')
