import { generateI693PdfBytes, resolveI693TemplatePath } from '../lib/i693/generate-pdf.ts'
import { mergeI693Form } from '../lib/i693/types.ts'
import { validateI693PdfExport } from '../lib/i693/export-validation.ts'

const templatePath = await resolveI693TemplatePath()
if (!templatePath) {
  throw new Error('I-693 template not found')
}

const sample = mergeI693Form({
  applicant: {
    family_name: 'Export',
    given_name: 'Valid',
    middle_name: 'T',
    in_care_of: 'Care Of',
    street: '100 Main St',
    apt: '1A',
    city: 'Houston',
    state: 'TX',
    zip: '77001',
    country: 'United States',
    date_of_birth: '1990-01-15',
    city_of_birth: 'Houston',
    country_of_birth: 'United States',
    a_number: 'A123456789',
    uscis_online_account: '123456789012',
    sex: 'male',
  },
  application: {
    immigration_benefit: 'vaccination_only',
  },
  applicant_contact: {
    day_phone: '5551112222',
    mobile_phone: '5553334444',
    email: 'valid.export@example.com',
    applicant_signature_date: '2026-06-02',
  },
  civil_surgeon: {
    surgeon_name: 'Surgeon Test',
    practice_name: 'MEMR Clinic',
    street: '200 Clinic Ave',
    city: 'Houston',
    state: 'TX',
    zip: '77002',
    phone: '5558889999',
    email: 'surgeon@example.com',
    medical_license: 'TX12345',
    date_signed: '2026-06-02',
    summary_overall: 'class_b',
  },
})

const { bytes, mode, filledFields = [] } = await generateI693PdfBytes(sample)
const header = new TextDecoder().decode(bytes.slice(0, 8))

if (bytes.byteLength <= 0) {
  throw new Error('Generated PDF byte length is 0')
}

if (!header.startsWith('%PDF-')) {
  throw new Error(`Generated PDF header is invalid: ${JSON.stringify(header)}`)
}

const validation = await validateI693PdfExport(bytes, {
  templatePath,
  expectedFilledFields: filledFields.length,
})

console.log(
  JSON.stringify(
    {
      ok: true,
      mode,
      byteLength: bytes.byteLength,
      header,
      validation,
    },
    null,
    2
  )
)
