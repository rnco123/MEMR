import { readFile, writeFile } from 'node:fs/promises'
import { mergeI693Form } from '../lib/i693/types.ts'

const template = 'public/forms/i-693-template.pdf'
const { fillAcroformI693PdfMupdf } = await import('../lib/i693/fill-acroform-mupdf.ts')

const sample = mergeI693Form({
  applicant: {
    family_name: 'Chen',
    given_name: 'Ben',
    middle_name: 'Raheel',
    street: '200 Kanban Demo Ln',
    city: 'Houston',
    state: 'TX',
    zip: '77002',
    country: 'United States',
    sex: 'male',
  },
})

const { bytes, filled } = await fillAcroformI693PdfMupdf(template, sample)
await writeFile('public/forms/i-693-acroform-test.pdf', bytes)
console.log('Wrote public/forms/i-693-acroform-test.pdf')
console.log('filled', filled.length, filled.slice(0, 20))
