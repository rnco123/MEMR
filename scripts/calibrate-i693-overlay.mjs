/**
 * Print suggested fill-box coordinates (x, y) from label positions in the USCIS template.
 * y = top of fill box from page bottom. Run: node scripts/calibrate-i693-overlay.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const template = path.join(root, 'public/forms/i-693-template.pdf')
const H = 792
const GAP = 18

const mupdf = await import('mupdf')
const doc = mupdf.Document.openDocument(template)

function boxTop(pageIndex, term) {
  const page = doc.loadPage(pageIndex)
  const hits = page.search(term)
  if (!hits?.length) return null
  const q = hits[0][0]
  const x = Math.min(q[0], q[2], q[4], q[6])
  const yBottom = Math.max(q[1], q[3], q[5], q[7])
  return { x: Math.round(x), y: Math.round(H - yBottom - GAP) }
}

const sections = [
  {
    page: 0,
    fields: [
      ['applicant.family_name', 'Family Name'],
      ['applicant.given_name', 'Given Name'],
      ['applicant.middle_name', 'Middle Name'],
      ['applicant.in_care_of', 'In Care Of'],
      ['applicant.street', 'Street Number'],
      ['applicant.city', 'City or Town'],
      ['applicant.state', 'State'],
      ['applicant.zip', 'ZIP Code'],
      ['applicant.province', 'Province'],
      ['applicant.postal_code', 'Postal Code'],
      ['applicant.date_of_birth', 'Date of Birth'],
      ['applicant.city_of_birth', 'City/Town/Village of Birth'],
      ['applicant.country_of_birth', 'Country of Birth'],
      ['applicant.a_number', 'A-Number'],
      ['applicant.sex:male', 'Male'],
      ['applicant.sex:female', 'Female'],
    ],
  },
  {
    page: 1,
    fields: [
      ['applicant_contact.day_phone', 'Daytime Telephone Number'],
      ['applicant_contact.mobile_phone', 'Mobile Telephone'],
      ['applicant_contact.email', 'Email Address'],
    ],
  },
]

console.log(`Template: ${template}\n`)
for (const { page, fields } of sections) {
  console.log(`--- page index ${page} ---`)
  for (const [key, term] of fields) {
    const r = boxTop(page, term)
    console.log(r ? `  { key: '${key}', page: ${page}, x: ${r.x}, y: ${r.y} }` : `  // ${key}: "${term}" not found`)
  }
}
