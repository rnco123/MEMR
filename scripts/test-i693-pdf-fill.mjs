import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

async function main() {
  const modUrl = pathToFileURL(path.join(root, 'lib/i693/fill-flat-in-process.ts')).href
  const { fillFlatI693PdfInProcess } = await import(modUrl)
  const template = path.join(root, 'public/forms/i-693-template.pdf')
  const sample = {
    applicant: {
      family_name: 'ImmigrationSample',
      given_name: 'Maria',
      middle_name: '',
      in_care_of: '',
      street: '123 Main Street',
      apt: '',
      city: 'Houston',
      state: 'TX',
      zip: '77001',
      province: '',
      postal_code: '',
      country: 'United States',
      date_of_birth: '1990-06-15',
      city_of_birth: '',
      state_of_birth: '',
      country_of_birth: 'Mexico',
      country_of_citizenship: 'Mexico',
      a_number: 'A123456789',
      uscis_online_account: '',
      passport_number: '',
      sex: 'female',
      eligibility_category: 'Adjustment of status',
    },
    application: { immigration_benefit: '', city_where_filed: '', state_where_filed: '', class_of_admission: '', receipt_number: '', consulate_location: '', remarks: '' },
    uscis_records: { request_records: null, form_type: '', receipt_number: '', remarks: '' },
    applicant_contact: { day_phone: '', mobile_phone: '', email: '', applicant_signature_date: '', can_read_english: null, remarks: '' },
    interpreter: { used_interpreter: null, interpreter_name: '', interpreter_organization: '', interpreter_phone: '', interpreter_email: '', interpreter_signature_date: '' },
    preparer: { prepared_by_other: null, preparer_name: '', preparer_organization: '', preparer_phone: '', preparer_email: '', preparer_signature_date: '' },
    medical_history: { height: '', weight: '', bmi: '', blood_pressure: '', pulse: '', temperature: '', general_appearance: '', eyes_ears_nose_throat: '', cardiovascular: '', pulmonary: '', abdomen: '', musculoskeletal: '', neurologic: '', psychiatric: '', skin: '', lymphatic: '', remarks: '' },
    tb_screening: { tuberculin_skin_test: '', quantiferon_t_spot: 'Quantiferon negative', chest_xray: '', classification: 'No active TB', treatment: '', remarks: '' },
    syphilis_sti: { syphilis_test_type: '', syphilis_result: 'Non-reactive', syphilis_date: '', gonorrhea_result: 'Negative', gonorrhea_date: '', other_sti: '', remarks: '' },
    physical_mental: { class_a_conditions: '', class_b_conditions: '', harmful_behavior: '', remarks: 'None identified' },
    drug_abuse: { class_a: '', class_b: '', in_remission: '', remarks: 'No evidence' },
    other_conditions: { conditions: '', remarks: '' },
    vaccinations: [{ vaccine_name: 'MMR', date_given: '2010-05-01', waiver_reason: '', not_medically_appropriate: false }],
    civil_surgeon: { surgeon_name: '', practice_name: '', street: '', city: '', state: '', zip: '', phone: '', email: '', medical_license: '', emedical_id: '', date_signed: '', vaccinations_complete: true, vaccination_remarks: 'Review record', summary_remarks: 'Patient presents for immigration exam.' },
  }

  console.log('Filling', template)
  const { bytes, filled } = await fillFlatI693PdfInProcess(template, sample)
  const out = path.join(root, 'public/forms/i-693-filled-test.pdf')
  fs.writeFileSync(out, bytes)
  console.log('Wrote', out, 'filled keys:', filled.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
