/**
 * Validates PDF field registry: every binding has a field object and round-trip fill.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PDF_FIELD_REGISTRY } from '../lib/i693/pdf-field-registry.ts'
import { mergeI693Form, EMPTY_I693_FORM } from '../lib/i693/types.ts'
import { fillAcroformI693PdfMupdf } from '../lib/i693/fill-acroform-mupdf.ts'

const template = 'public/forms/i-693-template.pdf'
const data = new Uint8Array(readFileSync(template))
const pdf = await getDocument({ data, useSystemFonts: true }).promise
const fieldObjects = await pdf.getFieldObjects()

const sample = mergeI693Form({
  applicant: {
    family_name: 'TestFamily',
    given_name: 'TestGiven',
    middle_name: 'T',
    street: '100 Test St',
    city: 'Houston',
    state: 'TX',
    zip: '77001',
    country: 'United States',
    date_of_birth: '1990-01-15',
    city_of_birth: 'Houston',
    country_of_birth: 'United States',
    a_number: 'A123456789',
    uscis_online_account: 'testacct12',
    sex: 'male',
  },
  application: { immigration_benefit: 'vaccination_only' },
})

let missing = 0
const byPage = new Map()
for (const b of PDF_FIELD_REGISTRY) {
  const fo = fieldObjects?.[b.pdfFieldName]
  if (!fo?.[0]?.id) {
    console.error('MISSING field object:', b.pdfFieldName, b.key)
    missing++
    continue
  }
  const list = byPage.get(b.page) ?? []
  list.push(b.key)
  byPage.set(b.page, list)
}

console.log('Registry bindings:', PDF_FIELD_REGISTRY.length)
console.log('Missing in PDF:', missing)
for (const [page, keys] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  page ${page + 1}: ${keys.length} fields`)
}

const { bytes, filled } = await fillAcroformI693PdfMupdf(template, sample)
writeFileSync('public/forms/i-693-field-test.pdf', bytes)
console.log('MuPDF fill wrote public/forms/i-693-field-test.pdf, filled', filled.length, 'keys')

if (missing > 0) process.exit(1)
console.log('OK — all registry bindings exist in template')
