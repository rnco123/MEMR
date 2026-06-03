import { writeFile } from 'fs/promises'
import { generateI693PdfBytes } from '../lib/i693/generate-pdf.ts'
import { mergeI693Form } from '../lib/i693/types.ts'
import { loadMupdf } from '../lib/i693/mupdf-template.ts'

const ann = [
  {
    id: '1',
    page: 1,
    type: 'text',
    xPercent: 0.15,
    yPercent: 0.12,
    widthPercent: 0.25,
    heightPercent: 0.04,
    value: 'OVERLAY_TEST',
  },
  {
    id: '2',
    page: 1,
    type: 'cross',
    xPercent: 0.05,
    yPercent: 0.35,
    sizePercent: 0.025,
  },
]

const sample = mergeI693Form({
  applicant: { family_name: 'Chen', given_name: 'Ben' },
})

const { bytes } = await generateI693PdfBytes(sample, ann, { bakeAnnotations: true })
await writeFile('reports/test-overlay-bake.pdf', bytes)

const mupdf = await loadMupdf()
const doc = mupdf.Document.openDocument(bytes, 'application/pdf')
const page = doc.loadPage(0)
const annots = page.getAnnotations()

const info = annots.map((a) => ({
  type: a.getType(),
  contents: a.getContents?.() ?? null,
  hasAP: (() => {
    try {
      const obj = a.getObject()
      const ap = obj.get?.('AP')
      return ap ? !ap.isNull?.() : false
    } catch {
      return false
    }
  })(),
}))

console.log(
  JSON.stringify({ annotationCount: annots.length, annotations: info }, null, 2)
)

const hasText = info.some((a) => a.type === 'FreeText' && a.contents?.includes('OVERLAY_TEST'))
const hasCross = info.some((a) => a.type === 'Ink')
if (!hasText || !hasCross) {
  console.error('FAIL - missing FreeText or Ink annotation')
  process.exit(1)
}
console.log('PASS')
