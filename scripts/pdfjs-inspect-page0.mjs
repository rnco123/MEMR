import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const data = new Uint8Array(readFileSync('public/forms/i-693-template.pdf'))
const pdf = await getDocument({ data, useSystemFonts: true }).promise
console.log('pages', pdf.numPages)

for (let i = 1; i <= 2; i++) {
  const page = await pdf.getPage(i)
  const annots = await page.getAnnotations()
  const widgets = annots.filter((a) => a.subtype === 'Widget')
  console.log('page', i, 'total', annots.length, 'widgets', widgets.length)
  for (const w of widgets.slice(0, 8)) {
    console.log(' ', w.fieldName, w.fieldType, w.rect)
  }
}

try {
  const objs = await pdf.getFieldObjects()
  console.log('fieldObjects keys', objs ? Object.keys(objs).length : 0)
  if (objs) {
    const first = Object.entries(objs).slice(0, 5)
    for (const [k, v] of first) console.log(k, v)
  }
} catch (e) {
  console.log('getFieldObjects err', e.message)
}
