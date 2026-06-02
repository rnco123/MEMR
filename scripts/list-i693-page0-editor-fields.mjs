import { extractPdfWidgetEditorFields } from '../lib/i693/extract-pdf-widgets.ts'
const fields = await extractPdfWidgetEditorFields('public/forms/i-693-template.pdf')
const p0 = fields.filter(f => f.page === 0)
console.log('page0 count', p0.length)
for (const f of p0) console.log(f.kind, f.key, f.slot||'', Math.round(f.x), Math.round(f.y), Math.round(f.width))
