import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const template = path.join(root, 'public/forms/i-693-template.pdf')
const H = 792
const GAP = 18
const mupdf = await import('mupdf')
const doc = mupdf.Document.openDocument(template)

function boxTop(pageIdx, term) {
  const page = doc.loadPage(pageIdx)
  const hits = page.search(term)
  if (!hits?.length) return null
  const q = hits[0][0]
  return {
    x: Math.round(Math.min(q[0], q[2], q[4], q[6])),
    y: Math.round(H - Math.max(q[1], q[3], q[5], q[7]) - GAP),
  }
}

console.log('=== Repeated header (Family Name) per page ===')
for (let p = 0; p < doc.countPages(); p++) {
  const hits = doc.loadPage(p).search('Family Name')
  if (!hits?.length) continue
  const q = hits[0][0]
  const x = Math.round(Math.min(q[0], q[2], q[4], q[6]))
  const y = Math.round(H - Math.max(q[1], q[3], q[5], q[7]) - GAP)
  console.log(`page ${p}: x=${x} y=${y}`)
}

console.log('\n=== Page 3 civil surgeon / Part 7 ===')
for (const t of [
  'Civil Surgeon',
  'Medical Practice',
  'Street Number',
  'City or Town',
  'No Class A',
  'Class A Conditions',
  'Date of First Examination',
]) {
  console.log(t, boxTop(3, t))
}

console.log('\n=== Checkboxes Part 6 page 3 ===')
for (const t of ['No Class A', 'Class A', 'Class B']) {
  const b = boxTop(3, t)
  console.log(t, b)
}
