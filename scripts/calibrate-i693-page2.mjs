import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const template = path.join(root, 'public/forms/i-693-template.pdf')
const H = 792
const mupdf = await import('mupdf')
const doc = mupdf.Document.openDocument(template)

function box(pageIdx, term) {
  const page = doc.loadPage(pageIdx)
  const hits = page.search(term)
  if (!hits?.length) return null
  const q = hits[0][0]
  return {
    x: Math.round(Math.min(q[0], q[2], q[4], q[6])),
    y: Math.round(H - Math.max(q[1], q[3], q[5], q[7]) - 18),
  }
}

const terms = [
  [1, "Interpreter's Family"],
  [1, "Interpreter's Given"],
  [1, "Interpreter's Business"],
  [1, "Interpreter's Mobile"],
  [1, "Interpreter's Daytime"],
  [1, "Interpreter's Email"],
  [1, "Interpreter's Signature"],
  [1, "Applicant's Signature"],
  [1, "Applicant's Daytime"],
  [1, "Applicant's Mobile"],
  [1, "Applicant's Email"],
  [2, "Preparer's Family"],
  [2, "Preparer's Given"],
  [2, "Preparer's Business"],
  [2, "Preparer's Mobile"],
  [2, "Preparer's Daytime"],
  [2, "Preparer's Email"],
  [2, "Preparer's Signature"],
  [2, "Interpreter's Signature"],
  [0, 'eligible for completion'],
  [1, 'interpreter_signature_date'],
  [2, 'Date of Signature'],
  [2, 'interpreter_signature'],
]

for (const [p, t] of terms) {
  console.log(`page ${p}\t${t}\t`, JSON.stringify(box(p, t)))
}
