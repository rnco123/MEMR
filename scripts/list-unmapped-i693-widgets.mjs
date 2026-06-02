import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  WIDGET_TEXT_TO_KEY,
  WIDGET_CHECKBOX_BINDINGS,
  widgetShortName,
  widgetFieldIndex,
  isIgnoredWidget,
  WIDGET_STREET_IN_CARE_OF_INDEX,
} from '../lib/i693/pdf-widget-map.ts'

const pdf = await getDocument({
  data: readFileSync('public/forms/i-693-template.pdf'),
}).promise

const unmapped = new Set()
let total = 0

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p)
  for (const a of await page.getAnnotations()) {
    if (a.subtype !== 'Widget' || !a.fieldName || isIgnoredWidget(a.fieldName)) continue
    total++
    const short = widgetShortName(a.fieldName)
    const idx = widgetFieldIndex(a.fieldName)
    const cb = WIDGET_CHECKBOX_BINDINGS.find((b) => b.widget === short && b.index === idx)
    if (cb) continue
    let ok = !!WIDGET_TEXT_TO_KEY[short]
    if (short === 'Pt1Line2_StreetNumberName' && idx === WIDGET_STREET_IN_CARE_OF_INDEX) ok = true
    if (!ok) unmapped.add(short)
  }
}

console.log('widgets', total, 'unmapped short names', unmapped.size)
console.log([...unmapped].sort().slice(0, 40).join('\n'))
