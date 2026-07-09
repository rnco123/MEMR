/** UI section metadata for I693FormEditor — aligned to USCIS Form I-693 parts */

export type I693FieldDef = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'date' | 'select' | 'boolean'
  options?: { value: string; label: string }[]
  rows?: number
}

const yesNoUnknown: I693FieldDef['options'] = [
  { value: '', label: 'Unknown' },
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]

const sexOptions: I693FieldDef['options'] = [
  { value: '', label: '—' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

export const I693_BOOLEAN_KEYS = new Set([
  'uscis_records.request_records',
  'applicant_contact.can_read_english',
  'interpreter.used_interpreter',
  'preparer.prepared_by_other',
  'civil_surgeon.vaccinations_complete',
])

export const I693_UI_SECTIONS: { title: string; fields: I693FieldDef[] }[] = [
  {
    title: 'Part 1 — Information about you',
    fields: [
      { key: 'applicant.family_name', label: 'Family name (last)', type: 'text' },
      { key: 'applicant.given_name', label: 'Given name (first)', type: 'text' },
      { key: 'applicant.middle_name', label: 'Middle name', type: 'text' },
      { key: 'applicant.in_care_of', label: 'In care of', type: 'text' },
      { key: 'applicant.street', label: 'Street number and name', type: 'text' },
      { key: 'applicant.apt', label: 'Apt / Ste / Flr', type: 'text' },
      { key: 'applicant.city', label: 'City or town', type: 'text' },
      { key: 'applicant.state', label: 'State', type: 'text' },
      { key: 'applicant.zip', label: 'ZIP code', type: 'text' },
      { key: 'applicant.province', label: 'Province (foreign address)', type: 'text' },
      { key: 'applicant.postal_code', label: 'Postal code (foreign)', type: 'text' },
      { key: 'applicant.country', label: 'Country', type: 'text' },
      { key: 'applicant.date_of_birth', label: 'Date of birth', type: 'date' },
      { key: 'applicant.city_of_birth', label: 'City/town/village of birth', type: 'text' },
      { key: 'applicant.state_of_birth', label: 'State/province of birth', type: 'text' },
      { key: 'applicant.country_of_birth', label: 'Country of birth', type: 'text' },
      { key: 'applicant.country_of_citizenship', label: 'Country of citizenship', type: 'text' },
      { key: 'applicant.a_number', label: 'A-Number (if any)', type: 'text' },
      { key: 'applicant.uscis_online_account', label: 'USCIS online account number', type: 'text' },
      { key: 'applicant.passport_number', label: 'Passport number', type: 'text' },
      { key: 'applicant.sex', label: 'Sex', type: 'select', options: sexOptions },
      { key: 'applicant.eligibility_category', label: 'Eligibility category', type: 'text' },
    ],
  },
  {
    title: 'Part 2 — Application information',
    fields: [
      { key: 'application.immigration_benefit', label: 'Immigration benefit sought', type: 'text' },
      { key: 'application.city_where_filed', label: 'City where application filed', type: 'text' },
      { key: 'application.state_where_filed', label: 'State where application filed', type: 'text' },
      { key: 'application.class_of_admission', label: 'Class of admission (if known)', type: 'text' },
      { key: 'application.receipt_number', label: 'USCIS receipt number', type: 'text' },
      { key: 'application.consulate_location', label: 'Embassy/consulate (if abroad)', type: 'text' },
      { key: 'application.remarks', label: 'Remarks', type: 'textarea', rows: 2 },
    ],
  },
  {
    title: 'Part 3 — Request for USCIS records',
    fields: [
      { key: 'uscis_records.request_records', label: 'Request records from USCIS', type: 'boolean', options: yesNoUnknown },
      { key: 'uscis_records.form_type', label: 'Form type / benefit', type: 'text' },
      { key: 'uscis_records.receipt_number', label: 'Receipt number', type: 'text' },
      { key: 'uscis_records.remarks', label: 'Remarks', type: 'textarea', rows: 2 },
    ],
  },
  {
    title: 'Part 4 — Applicant contact and signature',
    fields: [
      { key: 'applicant_contact.day_phone', label: 'Daytime telephone', type: 'text' },
      { key: 'applicant_contact.mobile_phone', label: 'Mobile telephone', type: 'text' },
      { key: 'applicant_contact.email', label: 'Email address', type: 'text' },
      { key: 'applicant_contact.can_read_english', label: 'Applicant can read English', type: 'boolean', options: yesNoUnknown },
      { key: 'applicant_contact.applicant_signature_date', label: 'Applicant signature date', type: 'date' },
      { key: 'applicant_contact.remarks', label: 'Remarks', type: 'textarea', rows: 2 },
      {
        key: 'applicant_contact.id_document_type',
        label: 'Form of identification presented',
        type: 'text',
      },
      {
        key: 'applicant_contact.id_document_number',
        label: 'Document identification number',
        type: 'text',
      },
    ],
  },
  {
    title: 'Part 5 — Interpreter (if used)',
    fields: [
      { key: 'interpreter.used_interpreter', label: 'Interpreter used', type: 'boolean', options: yesNoUnknown },
      { key: 'interpreter.interpreter_name', label: 'Interpreter name', type: 'text' },
      { key: 'interpreter.interpreter_organization', label: 'Organization', type: 'text' },
      { key: 'interpreter.interpreter_phone', label: 'Telephone', type: 'text' },
      { key: 'interpreter.interpreter_email', label: 'Email', type: 'text' },
      { key: 'interpreter.interpreter_signature_date', label: 'Interpreter signature date', type: 'date' },
    ],
  },
  {
    title: 'Part 6 — Preparer (if not applicant)',
    fields: [
      { key: 'preparer.prepared_by_other', label: 'Prepared by someone other than applicant', type: 'boolean', options: yesNoUnknown },
      { key: 'preparer.preparer_name', label: 'Preparer name', type: 'text' },
      { key: 'preparer.preparer_organization', label: 'Organization', type: 'text' },
      { key: 'preparer.preparer_phone', label: 'Telephone', type: 'text' },
      { key: 'preparer.preparer_email', label: 'Email', type: 'text' },
      { key: 'preparer.preparer_signature_date', label: 'Preparer signature date', type: 'date' },
    ],
  },
  {
    title: 'Part 7 — Medical history and physical examination',
    fields: [
      { key: 'medical_history.height', label: 'Height', type: 'text' },
      { key: 'medical_history.weight', label: 'Weight', type: 'text' },
      { key: 'medical_history.bmi', label: 'BMI', type: 'text' },
      { key: 'medical_history.blood_pressure', label: 'Blood pressure', type: 'text' },
      { key: 'medical_history.pulse', label: 'Pulse', type: 'text' },
      { key: 'medical_history.temperature', label: 'Temperature', type: 'text' },
      { key: 'medical_history.general_appearance', label: 'General appearance', type: 'textarea', rows: 2 },
      { key: 'medical_history.eyes_ears_nose_throat', label: 'Eyes / ears / nose / throat', type: 'textarea', rows: 2 },
      { key: 'medical_history.cardiovascular', label: 'Cardiovascular', type: 'textarea', rows: 2 },
      { key: 'medical_history.pulmonary', label: 'Pulmonary', type: 'textarea', rows: 2 },
      { key: 'medical_history.abdomen', label: 'Abdomen', type: 'textarea', rows: 2 },
      { key: 'medical_history.musculoskeletal', label: 'Musculoskeletal', type: 'textarea', rows: 2 },
      { key: 'medical_history.neurologic', label: 'Neurologic', type: 'textarea', rows: 2 },
      { key: 'medical_history.psychiatric', label: 'Psychiatric', type: 'textarea', rows: 2 },
      { key: 'medical_history.skin', label: 'Skin', type: 'textarea', rows: 2 },
      { key: 'medical_history.lymphatic', label: 'Lymphatic', type: 'textarea', rows: 2 },
      { key: 'medical_history.remarks', label: 'Additional exam remarks', type: 'textarea', rows: 3 },
    ],
  },
  {
    title: 'Part 8 — Tuberculosis screening',
    fields: [
      { key: 'tb_screening.tuberculin_skin_test', label: 'Tuberculin skin test (TST)', type: 'text' },
      { key: 'tb_screening.quantiferon_t_spot', label: 'IGRA (Quantiferon / T-SPOT)', type: 'text' },
      { key: 'tb_screening.chest_xray', label: 'Chest X-ray', type: 'text' },
      { key: 'tb_screening.classification', label: 'TB classification', type: 'text' },
      { key: 'tb_screening.treatment', label: 'TB treatment (if any)', type: 'text' },
      { key: 'tb_screening.remarks', label: 'TB remarks', type: 'textarea', rows: 3 },
    ],
  },
  {
    title: 'Part 9 — Syphilis and other STI',
    fields: [
      { key: 'syphilis_sti.syphilis_test_type', label: 'Syphilis test type', type: 'text' },
      { key: 'syphilis_sti.syphilis_result', label: 'Syphilis serology result', type: 'text' },
      { key: 'syphilis_sti.syphilis_date', label: 'Syphilis test date', type: 'date' },
      {
        key: 'syphilis_sti.nonreactive_date_reported',
        label: 'Nontreponemal nonreactive date reported',
        type: 'date',
      },
      { key: 'syphilis_sti.screening_titer', label: 'Screening reactive titer', type: 'text' },
      { key: 'syphilis_sti.gonorrhea_result', label: 'Gonorrhea result', type: 'text' },
      { key: 'syphilis_sti.gonorrhea_date', label: 'Gonorrhea test date', type: 'date' },
      { key: 'syphilis_sti.other_sti', label: 'Other STI screening', type: 'text' },
      { key: 'syphilis_sti.remarks', label: 'Remarks', type: 'textarea', rows: 2 },
    ],
  },
  {
    title: 'Part 10 — Physical or mental disorders',
    fields: [
      { key: 'physical_mental.class_a_conditions', label: 'Class A conditions', type: 'textarea', rows: 2 },
      { key: 'physical_mental.class_b_conditions', label: 'Class B conditions', type: 'textarea', rows: 2 },
      { key: 'physical_mental.harmful_behavior', label: 'Harmful behavior history', type: 'textarea', rows: 2 },
      { key: 'physical_mental.remarks', label: 'Remarks', type: 'textarea', rows: 3 },
    ],
  },
  {
    title: 'Part 11 — Drug abuse and addiction',
    fields: [
      { key: 'drug_abuse.class_a', label: 'Class A (current abuse)', type: 'textarea', rows: 2 },
      { key: 'drug_abuse.class_b', label: 'Class B (past abuse)', type: 'textarea', rows: 2 },
      { key: 'drug_abuse.in_remission', label: 'In remission / treatment', type: 'text' },
      { key: 'drug_abuse.remarks', label: 'Remarks', type: 'textarea', rows: 3 },
    ],
  },
  {
    title: 'Part 12 — Other medical conditions',
    fields: [
      { key: 'other_conditions.conditions', label: 'Other conditions', type: 'textarea', rows: 3 },
      { key: 'other_conditions.remarks', label: 'Remarks', type: 'textarea', rows: 2 },
    ],
  },
  {
    title: 'Part 14 — Civil surgeon identification and certification',
    fields: [
      { key: 'civil_surgeon.surgeon_name', label: 'Civil surgeon name', type: 'text' },
      { key: 'civil_surgeon.practice_name', label: 'Practice / clinic name', type: 'text' },
      { key: 'civil_surgeon.street', label: 'Street address', type: 'text' },
      { key: 'civil_surgeon.city', label: 'City', type: 'text' },
      { key: 'civil_surgeon.state', label: 'State', type: 'text' },
      { key: 'civil_surgeon.zip', label: 'ZIP', type: 'text' },
      { key: 'civil_surgeon.phone', label: 'Telephone', type: 'text' },
      { key: 'civil_surgeon.email', label: 'Email', type: 'text' },
      { key: 'civil_surgeon.medical_license', label: 'Medical license number', type: 'text' },
      { key: 'civil_surgeon.emedical_id', label: 'eMedical / panel ID', type: 'text' },
      { key: 'civil_surgeon.vaccinations_complete', label: 'Vaccinations complete', type: 'boolean', options: yesNoUnknown },
      { key: 'civil_surgeon.vaccination_remarks', label: 'Vaccination remarks', type: 'textarea', rows: 2 },
      { key: 'civil_surgeon.summary_remarks', label: 'Summary / civil surgeon remarks', type: 'textarea', rows: 4 },
      { key: 'civil_surgeon.date_signed', label: 'Date signed', type: 'date' },
    ],
  },
]

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {}
    cur = cur[p] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]!] = value
}
