import type { I693FormData } from '@/lib/i693/types'
import { EMPTY_I693_FORM, mergeI693Form } from '@/lib/i693/types'

const FORM_SCHEMA = `{
  "applicant": { "family_name","given_name","middle_name","in_care_of","street","apt","city","state","zip","province","postal_code","country","date_of_birth","city_of_birth","state_of_birth","country_of_birth","country_of_citizenship","a_number","uscis_online_account","passport_number","sex":"male"|"female"|"","eligibility_category" },
  "application": { "immigration_benefit","city_where_filed","state_where_filed","class_of_admission","receipt_number","consulate_location","remarks" },
  "uscis_records": { "request_records":true|false|null,"form_type","receipt_number","remarks" },
  "applicant_contact": { "day_phone","mobile_phone","email","applicant_signature_date","can_read_english":true|false|null,"remarks" },
  "interpreter": { "used_interpreter":true|false|null,"interpreter_name","interpreter_organization","interpreter_phone","interpreter_email","interpreter_signature_date" },
  "preparer": { "prepared_by_other":true|false|null,"preparer_name","preparer_organization","preparer_phone","preparer_email","preparer_signature_date" },
  "medical_history": { "height","weight","bmi","blood_pressure","pulse","temperature","general_appearance","eyes_ears_nose_throat","cardiovascular","pulmonary","abdomen","musculoskeletal","neurologic","psychiatric","skin","lymphatic","remarks" },
  "tb_screening": { "tuberculin_skin_test","quantiferon_t_spot","chest_xray","classification","treatment","remarks" },
  "syphilis_sti": { "syphilis_test_type","syphilis_result","syphilis_date","gonorrhea_result","gonorrhea_date","other_sti","remarks" },
  "physical_mental": { "class_a_conditions","class_b_conditions","harmful_behavior","remarks" },
  "drug_abuse": { "class_a","class_b","in_remission","remarks" },
  "other_conditions": { "conditions","remarks" },
  "vaccinations": [{ "vaccine_name","date_given","waiver_reason","not_medically_appropriate":boolean }],
  "civil_surgeon": { "surgeon_name","practice_name","street","city","state","zip","phone","email","medical_license","emedical_id","date_signed","vaccinations_complete":true|false|null,"vaccination_remarks","summary_remarks" }
}`

const SYSTEM_PROMPT = `You are a U.S. immigration civil surgeon documentation assistant completing USCIS Form I-693 (Report of Medical Examination and Vaccination Record).

Rules:
- Output ONLY valid JSON matching the schema (all top-level sections required).
- Use facts from the clinical chart only. Do not invent lab results, vaccination dates, or diagnoses.
- If unknown, use empty string "" or null for boolean tri-state fields.
- Map patient demographics from the patient record (split legal name into family/given/middle when possible).
- date fields: YYYY-MM-DD if known, else "".
- applicant.sex: "male", "female", or "".
- Part 7 (medical_history): pull height, weight, BP, pulse, temperature from vitals when present; exam findings from SOAP/MA notes into organ-system fields.
- Part 8–11: TB, syphilis, gonorrhea, mental disorders, drug abuse — use chart documentation; if not documented use "Not documented in chart" or "".
- Part 13 vaccinations: only vaccines explicitly mentioned in intake or notes; else [].
- civil_surgeon.summary_remarks: 2–4 sentence exam summary from SOAP.
- civil_surgeon.date_signed: today's date (YYYY-MM-DD) only if exam appears complete; else "".
- interpreter.used_interpreter / preparer.prepared_by_other: null unless chart mentions them.
- Do NOT use a legacy "medical_examination" key.

Schema (all string fields unless noted):
${FORM_SCHEMA}`

export async function fillI693WithOpenAI(
  clinicalText: string,
  existingForm: I693FormData
): Promise<{ form: I693FormData; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey?.trim()) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const model = process.env.OPENAI_I693_MODEL?.trim() || 'gpt-4o-mini'

  const userContent = [
    'Complete ALL sections of Form I-693 (Parts 1–14) from this immigration medical encounter chart.',
    'Preserve non-empty values from CURRENT_DRAFT when the chart does not contradict them.',
    '',
    'CURRENT_DRAFT:',
    JSON.stringify(existingForm, null, 2),
    '',
    'CLINICAL CHART:',
    clinicalText.slice(0, 120000),
  ].join('\n')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI request failed: ${res.status} ${errText.slice(0, 500)}`)
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? '{}'
  let parsed: Partial<I693FormData>
  try {
    parsed = JSON.parse(raw) as Partial<I693FormData>
  } catch {
    throw new Error('OpenAI returned invalid JSON for I-693')
  }

  return { form: mergeI693Form(parsed), model }
}

/** Pre-fill applicant and contact from patient / vitals without LLM */
export function prefillFromPatient(
  patient: Record<string, unknown> | null,
  vitals: Record<string, unknown> | null,
  base: I693FormData = EMPTY_I693_FORM
): I693FormData {
  const form = mergeI693Form(base)
  if (!patient) return form

  const first = String(patient.first_name ?? '').trim()
  const last = String(patient.last_name ?? '').trim()
  if (last && !form.applicant.family_name) form.applicant.family_name = last
  if (first && !form.applicant.given_name) form.applicant.given_name = first
  if (patient.date_of_birth && !form.applicant.date_of_birth) {
    form.applicant.date_of_birth = String(patient.date_of_birth).slice(0, 10)
  }
  if (patient.street_address && !form.applicant.street) {
    form.applicant.street = String(patient.street_address)
  }
  if (patient.state && !form.applicant.state) form.applicant.state = String(patient.state)
  if (patient.zip_code && !form.applicant.zip) form.applicant.zip = String(patient.zip_code)
  if (patient.phone && !form.applicant_contact.day_phone) {
    form.applicant_contact.day_phone = String(patient.phone)
  }
  if (patient.email && !form.applicant_contact.email) {
    form.applicant_contact.email = String(patient.email)
  }
  const g = String(patient.gender ?? '').toLowerCase()
  if (!form.applicant.sex && (g === 'male' || g === 'female')) {
    form.applicant.sex = g
  }

  if (vitals) {
    if (vitals.height != null && !form.medical_history.height) {
      form.medical_history.height = String(vitals.height)
    }
    if (vitals.weight != null && !form.medical_history.weight) {
      form.medical_history.weight = String(vitals.weight)
    }
    if (vitals.blood_pressure != null && !form.medical_history.blood_pressure) {
      form.medical_history.blood_pressure = String(vitals.blood_pressure)
    }
    if (vitals.pulse != null && !form.medical_history.pulse) {
      form.medical_history.pulse = String(vitals.pulse)
    }
    if (vitals.temperature != null && !form.medical_history.temperature) {
      form.medical_history.temperature = String(vitals.temperature)
    }
  }

  return form
}
