/** Digital Form I-693 payload stored in i693_submissions.form_data */

export type I693VaccinationRow = {
  vaccine_name: string
  date_given: string
  waiver_reason: string
  not_medically_appropriate: boolean
}

/** USCIS Part 13 vaccination table row (normalized; not one PDF field per property). */
export type I693VaccinationGridRow = {
  vaccineCode: string
  dateGiven?: string
  dateReceived?: string
  /** Historical dose columns 1–4 when more than one dateReceived slot exists on the PDF. */
  datesReceived?: string[]
  completeSeries?: boolean
  contraindicated?: boolean
  insufficientInterval?: boolean
  notAgeAppropriate?: boolean
  immune?: boolean
  historyOfDisease?: boolean
}

export type I693FormData = {
  /**
   * Full PDF field name → value for widgets edited in the PDF form editor.
   * Preserves unmapped AcroForm fields (TB tables, signatures, etc.) across save/export.
   */
  pdf_widget_values?: Record<string, string>
  /** Part 1 — Information about you */
  applicant: {
    family_name: string
    given_name: string
    middle_name: string
    in_care_of: string
    street: string
    apt: string
    city: string
    state: string
    zip: string
    province: string
    postal_code: string
    country: string
    date_of_birth: string
    city_of_birth: string
    state_of_birth: string
    country_of_birth: string
    country_of_citizenship: string
    a_number: string
    uscis_online_account: string
    passport_number: string
    sex: '' | 'male' | 'female'
    eligibility_category: string
  }
  /** Part 2 — Application information */
  application: {
    immigration_benefit: string
    city_where_filed: string
    state_where_filed: string
    class_of_admission: string
    receipt_number: string
    consulate_location: string
    remarks: string
  }
  /** Part 3 — Request for USCIS records (if applicable) */
  uscis_records: {
    request_records: boolean | null
    form_type: string
    receipt_number: string
    remarks: string
  }
  /** Part 4 — Applicant contact, certification, signature */
  applicant_contact: {
    day_phone: string
    mobile_phone: string
    email: string
    applicant_signature_date: string
    can_read_english: boolean | null
    remarks: string
  }
  /** Part 5 — Interpreter (if any) */
  interpreter: {
    used_interpreter: boolean | null
    interpreter_name: string
    interpreter_organization: string
    interpreter_phone: string
    interpreter_email: string
    interpreter_signature_date: string
  }
  /** Part 6 — Person preparing form (if not applicant) */
  preparer: {
    prepared_by_other: boolean | null
    preparer_name: string
    preparer_organization: string
    preparer_phone: string
    preparer_email: string
    preparer_signature_date: string
  }
  /** Part 7 — Medical history and physical examination */
  medical_history: {
    height: string
    weight: string
    bmi: string
    blood_pressure: string
    pulse: string
    temperature: string
    general_appearance: string
    eyes_ears_nose_throat: string
    cardiovascular: string
    pulmonary: string
    abdomen: string
    musculoskeletal: string
    neurologic: string
    psychiatric: string
    skin: string
    lymphatic: string
    remarks: string
  }
  /** Part 8 — Tuberculosis screening */
  tb_screening: {
    tuberculin_skin_test: string
    quantiferon_t_spot: string
    chest_xray: string
    classification: string
    treatment: string
    remarks: string
  }
  /** Part 9 — Syphilis and other STI */
  syphilis_sti: {
    syphilis_test_type: string
    syphilis_result: string
    syphilis_date: string
    gonorrhea_result: string
    gonorrhea_date: string
    other_sti: string
    remarks: string
  }
  /** Part 10 — Physical or mental disorders */
  physical_mental: {
    class_a_conditions: string
    class_b_conditions: string
    harmful_behavior: string
    remarks: string
  }
  /** Part 11 — Drug abuse / addiction */
  drug_abuse: {
    class_a: string
    class_b: string
    in_remission: string
    remarks: string
  }
  /** Part 12 — Other medical conditions */
  other_conditions: {
    conditions: string
    remarks: string
  }
  /** Part 13 — Vaccination record */
  vaccinations: I693VaccinationRow[]
  /** Part 13 — USCIS fixed vaccination grid (DT, Td, MMR, …). */
  vaccination_grid: I693VaccinationGridRow[]
  /** Part 14 — Civil surgeon identification */
  civil_surgeon: {
    surgeon_name: string
    practice_name: string
    street: string
    apt: string
    city: string
    state: string
    zip: string
    phone: string
    email: string
    medical_license: string
    emedical_id: string
    date_signed: string
    vaccinations_complete: boolean | null
    vaccination_remarks: string
    summary_remarks: string
    /** Part 6 — one of: '', 'none', 'class_a', 'class_b' */
    summary_overall: string
  }
  /**
   * @deprecated Legacy blob — merged into parts above on load. AI may still return this key.
   */
  medical_examination?: {
    class_of_admission?: string
    tb_screening?: string
    tb_classification?: string
    syphilis_result?: string
    gonorrhea_result?: string
    physical_mental_disorders?: string
    drug_abuse_addiction?: string
    vaccinations_complete?: boolean | null
    vaccination_remarks?: string
    civil_surgeon_remarks?: string
    date_signed?: string
  }
}

function emptyApplicant(): I693FormData['applicant'] {
  return {
    family_name: '',
    given_name: '',
    middle_name: '',
    in_care_of: '',
    street: '',
    apt: '',
    city: '',
    state: '',
    zip: '',
    province: '',
    postal_code: '',
    country: '',
    date_of_birth: '',
    city_of_birth: '',
    state_of_birth: '',
    country_of_birth: '',
    country_of_citizenship: '',
    a_number: '',
    uscis_online_account: '',
    passport_number: '',
    sex: '',
    eligibility_category: '',
  }
}

export const EMPTY_I693_FORM: I693FormData = {
  applicant: emptyApplicant(),
  application: {
    immigration_benefit: '',
    city_where_filed: '',
    state_where_filed: '',
    class_of_admission: '',
    receipt_number: '',
    consulate_location: '',
    remarks: '',
  },
  uscis_records: {
    request_records: null,
    form_type: '',
    receipt_number: '',
    remarks: '',
  },
  applicant_contact: {
    day_phone: '',
    mobile_phone: '',
    email: '',
    applicant_signature_date: '',
    can_read_english: null,
    remarks: '',
  },
  interpreter: {
    used_interpreter: null,
    interpreter_name: '',
    interpreter_organization: '',
    interpreter_phone: '',
    interpreter_email: '',
    interpreter_signature_date: '',
  },
  preparer: {
    prepared_by_other: null,
    preparer_name: '',
    preparer_organization: '',
    preparer_phone: '',
    preparer_email: '',
    preparer_signature_date: '',
  },
  medical_history: {
    height: '',
    weight: '',
    bmi: '',
    blood_pressure: '',
    pulse: '',
    temperature: '',
    general_appearance: '',
    eyes_ears_nose_throat: '',
    cardiovascular: '',
    pulmonary: '',
    abdomen: '',
    musculoskeletal: '',
    neurologic: '',
    psychiatric: '',
    skin: '',
    lymphatic: '',
    remarks: '',
  },
  tb_screening: {
    tuberculin_skin_test: '',
    quantiferon_t_spot: '',
    chest_xray: '',
    classification: '',
    treatment: '',
    remarks: '',
  },
  syphilis_sti: {
    syphilis_test_type: '',
    syphilis_result: '',
    syphilis_date: '',
    gonorrhea_result: '',
    gonorrhea_date: '',
    other_sti: '',
    remarks: '',
  },
  physical_mental: {
    class_a_conditions: '',
    class_b_conditions: '',
    harmful_behavior: '',
    remarks: '',
  },
  drug_abuse: {
    class_a: '',
    class_b: '',
    in_remission: '',
    remarks: '',
  },
  other_conditions: {
    conditions: '',
    remarks: '',
  },
  vaccinations: [],
  vaccination_grid: [],
  civil_surgeon: {
    surgeon_name: '',
    practice_name: '',
    street: '',
    apt: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    email: '',
    medical_license: '',
    emedical_id: '',
    date_signed: '',
    vaccinations_complete: null,
    vaccination_remarks: '',
    summary_remarks: '',
    summary_overall: '',
  },
}

function mergeSection<T extends Record<string, unknown>>(empty: T, partial?: Partial<T> | null): T {
  return { ...empty, ...(partial ?? {}) } as T
}

const VACCINATION_GRID_CODES = [
  'dt',
  'td',
  'mmr',
  'polio',
  'hib',
  'hep_b',
  'varicella',
  'pneumo',
  'influenza',
  'hep_a',
  'meningococcal',
  'rotavirus',
  'hpv',
] as const

function mergeVaccinationGrid(
  partial?: I693VaccinationGridRow[] | null
): I693VaccinationGridRow[] {
  const byCode = new Map<string, I693VaccinationGridRow>()
  for (const vaccineCode of VACCINATION_GRID_CODES) {
    byCode.set(vaccineCode, { vaccineCode })
  }
  if (Array.isArray(partial)) {
    for (const row of partial) {
      if (!row?.vaccineCode) continue
      const prev = byCode.get(row.vaccineCode) ?? { vaccineCode: row.vaccineCode }
      byCode.set(row.vaccineCode, { ...prev, ...row })
    }
  }
  return VACCINATION_GRID_CODES.map((code) => byCode.get(code)!)
}

/** Map legacy medical_examination + flat applicant saves into current part structure */
function migrateLegacyForm(partial: Partial<I693FormData> & Record<string, unknown>): Partial<I693FormData> {
  const legacy = partial.medical_examination
  if (!legacy || typeof legacy !== 'object') return partial

  const out = { ...partial }
  const app = mergeSection(EMPTY_I693_FORM.application, out.application)
  if (legacy.class_of_admission && !app.class_of_admission) {
    app.class_of_admission = String(legacy.class_of_admission)
  }
  out.application = app

  const tb = mergeSection(EMPTY_I693_FORM.tb_screening, out.tb_screening)
  if (legacy.tb_screening && !tb.quantiferon_t_spot) tb.quantiferon_t_spot = String(legacy.tb_screening)
  if (legacy.tb_classification && !tb.classification) tb.classification = String(legacy.tb_classification)
  out.tb_screening = tb

  const sti = mergeSection(EMPTY_I693_FORM.syphilis_sti, out.syphilis_sti)
  if (legacy.syphilis_result && !sti.syphilis_result) sti.syphilis_result = String(legacy.syphilis_result)
  if (legacy.gonorrhea_result && !sti.gonorrhea_result) sti.gonorrhea_result = String(legacy.gonorrhea_result)
  out.syphilis_sti = sti

  const pm = mergeSection(EMPTY_I693_FORM.physical_mental, out.physical_mental)
  if (legacy.physical_mental_disorders && !pm.remarks) pm.remarks = String(legacy.physical_mental_disorders)
  out.physical_mental = pm

  const da = mergeSection(EMPTY_I693_FORM.drug_abuse, out.drug_abuse)
  if (legacy.drug_abuse_addiction && !da.remarks) da.remarks = String(legacy.drug_abuse_addiction)
  out.drug_abuse = da

  const cs = mergeSection(EMPTY_I693_FORM.civil_surgeon, out.civil_surgeon)
  if (legacy.civil_surgeon_remarks && !cs.summary_remarks) cs.summary_remarks = String(legacy.civil_surgeon_remarks)
  if (legacy.vaccination_remarks && !cs.vaccination_remarks) cs.vaccination_remarks = String(legacy.vaccination_remarks)
  if (legacy.vaccinations_complete != null && cs.vaccinations_complete == null) {
    cs.vaccinations_complete = legacy.vaccinations_complete
  }
  if (legacy.date_signed && !cs.date_signed) cs.date_signed = String(legacy.date_signed)
  out.civil_surgeon = cs

  return out
}

export function mergeI693Form(partial: Partial<I693FormData> | null | undefined): I693FormData {
  if (!partial || typeof partial !== 'object') {
    return {
      applicant: { ...EMPTY_I693_FORM.applicant },
      application: { ...EMPTY_I693_FORM.application },
      uscis_records: { ...EMPTY_I693_FORM.uscis_records },
      applicant_contact: { ...EMPTY_I693_FORM.applicant_contact },
      interpreter: { ...EMPTY_I693_FORM.interpreter },
      preparer: { ...EMPTY_I693_FORM.preparer },
      medical_history: { ...EMPTY_I693_FORM.medical_history },
      tb_screening: { ...EMPTY_I693_FORM.tb_screening },
      syphilis_sti: { ...EMPTY_I693_FORM.syphilis_sti },
      physical_mental: { ...EMPTY_I693_FORM.physical_mental },
      drug_abuse: { ...EMPTY_I693_FORM.drug_abuse },
      other_conditions: { ...EMPTY_I693_FORM.other_conditions },
      vaccinations: [],
      vaccination_grid: [],
      civil_surgeon: { ...EMPTY_I693_FORM.civil_surgeon },
    }
  }

  const migrated = migrateLegacyForm(partial as Partial<I693FormData> & Record<string, unknown>)

  return {
    applicant: mergeSection(EMPTY_I693_FORM.applicant, migrated.applicant),
    application: mergeSection(EMPTY_I693_FORM.application, migrated.application),
    uscis_records: mergeSection(EMPTY_I693_FORM.uscis_records, migrated.uscis_records),
    applicant_contact: mergeSection(EMPTY_I693_FORM.applicant_contact, migrated.applicant_contact),
    interpreter: mergeSection(EMPTY_I693_FORM.interpreter, migrated.interpreter),
    preparer: mergeSection(EMPTY_I693_FORM.preparer, migrated.preparer),
    medical_history: mergeSection(EMPTY_I693_FORM.medical_history, migrated.medical_history),
    tb_screening: mergeSection(EMPTY_I693_FORM.tb_screening, migrated.tb_screening),
    syphilis_sti: mergeSection(EMPTY_I693_FORM.syphilis_sti, migrated.syphilis_sti),
    physical_mental: mergeSection(EMPTY_I693_FORM.physical_mental, migrated.physical_mental),
    drug_abuse: mergeSection(EMPTY_I693_FORM.drug_abuse, migrated.drug_abuse),
    other_conditions: mergeSection(EMPTY_I693_FORM.other_conditions, migrated.other_conditions),
    vaccinations: Array.isArray(migrated.vaccinations)
      ? migrated.vaccinations.map((v) => ({
          vaccine_name: v?.vaccine_name ?? '',
          date_given: v?.date_given ?? '',
          waiver_reason: v?.waiver_reason ?? '',
          not_medically_appropriate: Boolean(v?.not_medically_appropriate),
        }))
      : [],
    vaccination_grid: mergeVaccinationGrid(migrated.vaccination_grid),
    civil_surgeon: mergeSection(EMPTY_I693_FORM.civil_surgeon, migrated.civil_surgeon),
    pdf_widget_values: mergePdfWidgetValues(migrated.pdf_widget_values),
  }
}

function mergePdfWidgetValues(
  partial?: Record<string, string> | null
): Record<string, string> | undefined {
  if (!partial || typeof partial !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(partial)) {
    if (typeof val === 'string' && val.trim()) out[key] = val.trim()
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function isImmigrationEncounter(consentAck: unknown): boolean {
  if (!consentAck || typeof consentAck !== 'object' || Array.isArray(consentAck)) return false
  const ack = consentAck as Record<string, unknown>
  return typeof ack.immigration === 'string' && ack.immigration.length > 0
}
