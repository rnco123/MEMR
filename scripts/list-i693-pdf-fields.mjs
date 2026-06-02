import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'

const path = process.argv[2] ?? 'public/forms/i-693-template.pdf'
const raw = await readFile(path)
const doc = await PDFDocument.load(raw, { ignoreEncryption: true })
const form = doc.getForm()
const fields = form.getFields()
console.log('path:', path)
console.log('pages:', doc.getPageCount())
console.log('acroform field count:', fields.length)
for (const f of fields.slice(0, 40)) {
  console.log(' -', f.getName(), f.constructor.name.replace('PDF', ''))
}
if (fields.length > 40) console.log(` ... and ${fields.length - 40} more`)
