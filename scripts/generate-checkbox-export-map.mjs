import { readFile } from 'fs/promises'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { normalizePdfCheckboxExport } from '../lib/i693/pdf-checkbox-utils.ts'
import { widgetFieldIndex } from '../lib/i693/pdf-widget-map.ts'
import { writeFile } from 'fs/promises'

const TEMPLATE_PATH = 'public/forms/i-693-template.pdf'
const OUT_PATH = 'lib/i693/pdf-checkbox-export-map.generated.json'

type FieldEntry = { exportValues?: unknown }

const data = new Uint8Array(await readFile(TEMPLATE_PATH))
const pdf = await getDocument({ data, verbosity: 0 }).promise
const fieldObjects = await pdf.getFieldObjects()
const map = {}

for (const [fieldName, entries] of Object.entries(fieldObjects ?? {})) {
  const list = (entries ?? []) as FieldEntry[]
  const idx = widgetFieldIndex(fieldName)
  const entry = list[idx] ?? list[0]
  const exp = normalizePdfCheckboxExport(entry?.exportValues)
  if (exp) map[fieldName] = exp
}

await writeFile(OUT_PATH, JSON.stringify(map, null, 2))
console.log('wrote', OUT_PATH, 'entries', Object.keys(map).length)
