import { mergeAcceptedI693AiDraft } from '@/lib/i693/supporting-documents/merge-draft'
import type { I693FormData } from '@/lib/i693/types'
import { EMPTY_I693_FORM, mergeI693Form } from '@/lib/i693/types'

const FORM_SCHEMA = `{
  "applicant": { "family_name","given_name","middle_name","in_care_of","street","apt","city","state","zip","province","postal_code","country","date_of_birth","city_of_birth","state_of_birth","country_of_birth","country_of_citizenship","a_number","uscis_online_account","passport_number","sex":"male"|"female"|"","eligibility_category" },
  "application": { "immigration_benefit","city_where_filed","state_where_filed","class_of_admission","receipt_number","consulate_location","remarks" },
  "uscis_records": { "request_records":true|false|null,"form_type","receipt_number","remarks" },
  "applicant_contact": { "day_phone","mobile_phone","email","applicant_signature_date","can_read_english":true|false|null,"remarks","id_document_type","id_document_number" },
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
- ADDRESS PARSING (critical): The patient's address may be stored as a single combined string (e.g. "123 Main St, Springfield, IL 62701, United States"). You MUST split it into individual fields:
    - applicant.street  → street number and name only (e.g. "123 Main St")
    - applicant.apt     → apartment / suite / floor number if present (e.g. "Apt 4B"), else ""
    - applicant.city    → city or town (e.g. "Springfield")
    - applicant.state   → 2-letter US state abbreviation (e.g. "IL"); use full name if abbreviation unknown
    - applicant.zip     → 5-digit ZIP code (e.g. "62701"), else ""
    - applicant.province    → province for foreign addresses, else ""
    - applicant.postal_code → postal code for foreign addresses, else ""
    - applicant.country     → country only if non-US (e.g. "Mexico"); for US addresses leave "" or "United States"
  If the state and ZIP are already provided separately in the patient record, trust those values.
  Never put a full address string into applicant.street — always split it.
- Part 5 identification (civil surgeon): when a passport is documented, set applicant_contact.id_document_type to "Passport" and applicant_contact.id_document_number to the passport number (also copy into applicant.passport_number when empty). For driver's license or other ID, use the document type/number as stated. Leave both fields "" if no ID document is documented.
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

  return { form: applyPassportToPart5Identification(mergeAcceptedI693AiDraft(existingForm, mergeI693Form(parsed))), model }
}

// ── Address parser ────────────────────────────────────────────────────────────

const STATE_FULL_TO_ABBREV: Readonly<Record<string, string>> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
  'Puerto Rico': 'PR', 'Guam': 'GU', 'American Samoa': 'AS',
  'U.S. Virgin Islands': 'VI', 'Northern Mariana Islands': 'MP',
}

const US_STATE_ABBREVS: ReadonlySet<string> = new Set([
  ...Object.values(STATE_FULL_TO_ABBREV),
])

const US_STATE_NAMES: ReadonlySet<string> = new Set(Object.keys(STATE_FULL_TO_ABBREV))

/** Default Part 1 physical-address country (always USA on I-693). */
export const DEFAULT_US_APPLICANT_COUNTRY = 'USA'

export function withDefaultUsApplicantCountry<T extends { country?: string }>(
  applicant: T
): T {
  if (applicant.country === DEFAULT_US_APPLICANT_COUNTRY) return applicant
  return { ...applicant, country: DEFAULT_US_APPLICANT_COUNTRY }
}

/**
 * Mirror a detected passport into USCIS Part 5 ID fields when those boxes are empty.
 * Does not overwrite an already chosen form of ID / number.
 */
export function applyPassportToPart5Identification(form: I693FormData): I693FormData {
  const passport = form.applicant.passport_number.trim()
  if (!passport) return form

  const contact = form.applicant_contact
  if (!contact.id_document_number.trim()) {
    contact.id_document_number = passport
  }
  if (!contact.id_document_type.trim() && contact.id_document_number.trim() === passport) {
    contact.id_document_type = 'Passport'
  }
  return form
}

/** Convert a full US state name to its 2-letter abbreviation; pass through if already abbreviated. */
export function normalizeStateAbbrev(raw: string): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (US_STATE_ABBREVS.has(trimmed.toUpperCase())) return trimmed.toUpperCase()
  return STATE_FULL_TO_ABBREV[trimmed] ?? trimmed
}

type ParsedAddress = {
  street: string
  apt: string
  city: string
  state: string
  zip: string
  country: string
}

/**
 * Parses a combined address string (common Google Maps / autocomplete format) into
 * individual I-693 form fields. Falls back gracefully when the format is unrecognised.
 *
 * Recognised formats (comma-separated):
 *   "123 Main St, City, State Zip, Country"
 *   "123 Main St, City, ST Zip, Country"
 *   "123 Main St Apt 4B, City, State Zip"
 */
export function parseAddressComponents(
  raw: string,
  knownState = '',
  knownZip = '',
): ParsedAddress {
  const fallback: ParsedAddress = { street: raw.trim(), apt: '', city: '', state: knownState, zip: knownZip, country: '' }
  if (!raw.includes(',')) return fallback

  const parts = raw.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return fallback

  let country = ''
  let state = ''
  let zip = ''
  let city = ''
  let street = ''
  let apt = ''

  // Walk from the end:
  let i = parts.length - 1

  // Last part → country if it looks like one
  const lastCountryRx = /^(United States(?: of America)?|USA?|Canada|Mexico|United Kingdom|UK|Australia)$/i
  const lastPart = parts[i] ?? ''
  if (lastCountryRx.test(lastPart)) {
    country = lastPart
    i--
  }

  // Next part → "State ZIP" or just state/zip
  if (i >= 1) {
    const stateZipPart = parts[i] ?? ''
    const zipRx = /(\d{5}(?:-\d{4})?)$/
    const zipMatch = stateZipPart.match(zipRx)
    if (zipMatch) {
      zip = zipMatch[1] ?? ''
      const statePart = stateZipPart.slice(0, zipMatch.index).trim()
      if (statePart) state = statePart
      i--
    } else if (US_STATE_ABBREVS.has(stateZipPart.toUpperCase())) {
      state = stateZipPart.toUpperCase()
      i--
    } else if (US_STATE_NAMES.has(stateZipPart)) {
      state = stateZipPart
      i--
    }
  }

  // Apply known values when parser didn't find them
  if (!state && knownState) state = knownState
  if (!zip && knownZip) zip = knownZip

  // Always normalise to 2-letter abbreviation for the PDF combo box
  state = normalizeStateAbbrev(state)

  // Next part → city
  if (i >= 1) {
    city = parts[i] ?? ''
    i--
  }

  // Remaining → street (join with comma)
  const streetRaw = parts.slice(0, i + 1).join(', ')

  // Extract apt from street if present: "123 Main St, Apt 4B" or "123 Main St Apt 4B"
  const aptRx = /\b(apt|ste?|suite|flr|floor|unit|#)\s*\.?\s*([A-Za-z0-9\-]+)\s*$/i
  const aptMatch = streetRaw.match(aptRx)
  if (aptMatch) {
    apt = aptMatch[0].trim()
    street = streetRaw.slice(0, aptMatch.index).trim().replace(/,\s*$/, '')
  } else {
    street = streetRaw
  }

  // If street ended up empty but we have a value, keep original
  if (!street && !city) return fallback

  return { street, apt, city, state, zip, country }
}

// ── Pre-fill from patient record ──────────────────────────────────────────────

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

  // Address — parse full address string into individual fields
  if (patient.street_address && !form.applicant.street && !form.applicant.city) {
    const knownState = patient.state ? String(patient.state).trim() : ''
    const knownZip = patient.zip_code ? String(patient.zip_code).trim() : ''
    const parsed = parseAddressComponents(String(patient.street_address), knownState, knownZip)

    if (!form.applicant.street) form.applicant.street = parsed.street
    if (!form.applicant.apt && parsed.apt) form.applicant.apt = parsed.apt
    if (!form.applicant.city && parsed.city) form.applicant.city = parsed.city
    if (!form.applicant.state && parsed.state) form.applicant.state = parsed.state
    if (!form.applicant.zip && parsed.zip) form.applicant.zip = parsed.zip
    if (!form.applicant.country && parsed.country) form.applicant.country = parsed.country
  } else {
    // street_address not set but individual fields might be
    if (patient.state && !form.applicant.state) form.applicant.state = String(patient.state)
    if (patient.zip_code && !form.applicant.zip) form.applicant.zip = String(patient.zip_code)
  }

  form.applicant = withDefaultUsApplicantCountry(form.applicant)

  applyPassportToPart5Identification(form)

  if (patient.phone && !form.applicant_contact.day_phone) {
    form.applicant_contact.day_phone = String(patient.phone).replace(/^\+1/, '')
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

// ── Address normalisation for saved form data ─────────────────────────────────

/**
 * Fixes form data where the full address string ended up in `applicant.street`.
 * Safe to call on any form — no-ops if address already looks clean.
 * Also normalises `applicant.state` to 2-letter abbreviation.
 */
export function normalizeI693FormAddress(form: I693FormData): I693FormData {
  const a = form.applicant
  const stateNorm = normalizeStateAbbrev(a.state)

  // Street looks like a full combined address (contains commas and no separate city)
  const streetLooksLikeFull = a.street.includes(',') && !a.city
  let next = form
  if (streetLooksLikeFull) {
    const parsed = parseAddressComponents(a.street, stateNorm, a.zip)
    next = {
      ...form,
      applicant: {
        ...a,
        street: parsed.street,
        apt: a.apt || parsed.apt,
        city: parsed.city || a.city,
        state: parsed.state || stateNorm,
        zip: parsed.zip || a.zip,
        country: a.country || parsed.country,
      },
    }
  } else if (stateNorm !== a.state) {
    next = { ...form, applicant: { ...a, state: stateNorm } }
  }

  const applicant = withDefaultUsApplicantCountry(next.applicant)
  if (applicant === next.applicant) return next
  return { ...next, applicant }
}
