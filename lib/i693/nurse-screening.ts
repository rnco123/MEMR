import { mergeI693Form, type I693FormData } from '@/lib/i693/types'

/**
 * Nurse-entered immigration intake captured in the Add Encounter modal at
 * immigration-only tenants. Mirrors the patient-facing booking app's Form A
 * clinical sections (same question keys); answers are merged into the
 * patient's i693_submissions.form_data so the I-693 editor starts pre-filled.
 */

export type YesNo = '' | 'yes' | 'no'

export type NurseVaccinationRow = {
  key: string
  haveRecord: YesNo
  dates: string
  notSure: boolean
}

export type NurseImmigrationScreening = {
  tb_diagnosed: YesNo
  tb_positive_test: YesNo
  tb_close_contact: YesNo
  tb_symptoms: YesNo
  abnormal_chest_xray: YesNo
  sti_or_hansens: YesNo
  psychiatric_diagnosis: YesNo
  hospitalized_or_treated: YesNo
  harm_thoughts: YesNo
  dui_dwi: YesNo
  has_allergies: YesNo
  /** Comma-separated allergen + reaction list, filled when has_allergies is yes. */
  allergies: string
  pregnant: '' | 'yes' | 'no' | 'unsure'
  pregnancy_weeks: string
  last_menstrual_period: string
  vaccinations: NurseVaccinationRow[]
  country_of_birth: string
  country_of_citizenship: string
  passport_number: string
  a_number: string
}

/** Booking-app Form A vaccine keys with the display names used on the I-693. */
export const NURSE_VACCINE_ROWS: { key: string; label: string }[] = [
  { key: 'td_tdap', label: 'Td/Tdap' },
  { key: 'mmr', label: 'MMR' },
  { key: 'polio', label: 'Polio' },
  { key: 'varicella', label: 'Varicella' },
  { key: 'hep_a', label: 'Hepatitis A' },
  { key: 'hep_b', label: 'Hepatitis B' },
  { key: 'pneumococcal', label: 'Pneumococcal' },
  { key: 'meningococcal', label: 'Meningococcal' },
  { key: 'hib', label: 'Hib' },
  { key: 'covid_19', label: 'COVID-19' },
  { key: 'influenza', label: 'Influenza (seasonal)' },
]

export const SCREENING_QUESTION_KEYS = [
  'tb_diagnosed',
  'tb_positive_test',
  'tb_close_contact',
  'tb_symptoms',
  'abnormal_chest_xray',
  'sti_or_hansens',
  'psychiatric_diagnosis',
  'hospitalized_or_treated',
  'harm_thoughts',
  'dui_dwi',
] as const

export function emptyNurseImmigrationScreening(): NurseImmigrationScreening {
  return {
    tb_diagnosed: '',
    tb_positive_test: '',
    tb_close_contact: '',
    tb_symptoms: '',
    abnormal_chest_xray: '',
    sti_or_hansens: '',
    psychiatric_diagnosis: '',
    hospitalized_or_treated: '',
    harm_thoughts: '',
    dui_dwi: '',
    has_allergies: '',
    allergies: '',
    pregnant: '',
    pregnancy_weeks: '',
    last_menstrual_period: '',
    vaccinations: NURSE_VACCINE_ROWS.map((row) => ({
      key: row.key,
      haveRecord: '',
      dates: '',
      notSure: false,
    })),
    country_of_birth: '',
    country_of_citizenship: '',
    passport_number: '',
    a_number: '',
  }
}

const yn = (v: YesNo) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : null)

function joinAnswers(pairs: Array<[string, string | null]>): string {
  return pairs
    .filter((p): p is [string, string] => p[1] != null)
    .map(([label, answer]) => `${label}: ${answer}.`)
    .join(' ')
}

/**
 * Replace any line we previously wrote (recognized by its marker prefix) with
 * the fresh one, so re-saving edited answers never duplicates remarks.
 */
function upsertMarkedLine(existing: string, line: string | null, marker: string): string {
  const kept = existing
    .split('\n')
    .filter((l) => !l.trim().startsWith(marker))
    .join('\n')
    .trim()
  if (!line) return kept
  return kept ? `${kept}\n${line}` : line
}

const REPORTED_MARKER = 'Patient-reported:'
const UNSURE_MARKER = 'Patient unsure of records:'
const PREGNANCY_MARKER = 'Patient-reported (pregnancy):'
const ALLERGY_MARKER = 'Patient-reported (allergies):'

/** Read structured screening answers back out of stored I-693 form data. */
export function extractNurseScreeningFromForm(
  form: Partial<I693FormData> | null | undefined
): NurseImmigrationScreening {
  const empty = emptyNurseImmigrationScreening()
  const raw = form?.intake_screening
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty
  const src = raw as Partial<NurseImmigrationScreening> & Record<string, unknown>

  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  const ynVal = (v: unknown): YesNo => (v === 'yes' || v === 'no' ? v : '')

  const out: NurseImmigrationScreening = {
    ...empty,
    has_allergies: ynVal(src.has_allergies),
    allergies: str(src.allergies),
    pregnant: src.pregnant === 'yes' || src.pregnant === 'no' || src.pregnant === 'unsure' ? src.pregnant : '',
    pregnancy_weeks: str(src.pregnancy_weeks),
    last_menstrual_period: str(src.last_menstrual_period),
    country_of_birth: str(src.country_of_birth),
    country_of_citizenship: str(src.country_of_citizenship),
    passport_number: str(src.passport_number),
    a_number: str(src.a_number),
  }
  for (const key of SCREENING_QUESTION_KEYS) out[key] = ynVal(src[key])

  const rows = Array.isArray(src.vaccinations) ? src.vaccinations : []
  out.vaccinations = empty.vaccinations.map((emptyRow) => {
    const found = rows.find(
      (r) => r && typeof r === 'object' && (r as NurseVaccinationRow).key === emptyRow.key
    ) as Partial<NurseVaccinationRow> | undefined
    if (!found) return emptyRow
    return {
      key: emptyRow.key,
      haveRecord: ynVal(found.haveRecord),
      dates: str(found.dates),
      notSure: found.notSure === true,
    }
  })
  return out
}

/**
 * Merge nurse screening answers into a patient's existing I-693 form data.
 * Identity fields fill empty applicant slots only (never overwrite), the
 * patient-reported screening answers land in the matching parts' remarks
 * (USCIS-facing, so kept in English), and vaccination rows with records are
 * appended to the Part 13 table when not already listed.
 */
export function applyNurseScreeningToI693Form(
  existing: Partial<I693FormData> | null | undefined,
  s: NurseImmigrationScreening
): I693FormData {
  const form = mergeI693Form(existing ?? null)

  // Keep the structured answers so the encounter modal can display/edit them.
  form.intake_screening = { ...s, vaccinations: s.vaccinations.map((row) => ({ ...row })) }

  // Screening stores ISO country codes; the USCIS form wants the English name.
  const countryNameEn = (v: string): string => {
    const trimmed = v.trim()
    if (!/^[A-Za-z]{2}$/.test(trimmed)) return trimmed
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(trimmed.toUpperCase()) ?? trimmed
    } catch {
      return trimmed
    }
  }

  const fillIfEmpty = (
    section: 'country_of_birth' | 'country_of_citizenship' | 'passport_number' | 'a_number',
    value: string
  ) => {
    const trimmed = value.trim()
    if (trimmed && !form.applicant[section]) form.applicant[section] = trimmed
  }
  fillIfEmpty('country_of_birth', countryNameEn(s.country_of_birth))
  fillIfEmpty('country_of_citizenship', countryNameEn(s.country_of_citizenship))
  fillIfEmpty('passport_number', s.passport_number)
  fillIfEmpty('a_number', s.a_number.replace(/^A-?/i, '').toUpperCase().slice(0, 9))

  const tbRemark = joinAnswers([
    ['TB diagnosed/treated', yn(s.tb_diagnosed)],
    ['Positive TB test (PPD/IGRA)', yn(s.tb_positive_test)],
    ['Close contact with active TB', yn(s.tb_close_contact)],
    ['TB symptoms (cough >3wk, night sweats, fever, weight loss)', yn(s.tb_symptoms)],
    ['Prior abnormal chest X-ray', yn(s.abnormal_chest_xray)],
  ])
  form.tb_screening.remarks = upsertMarkedLine(
    form.tb_screening.remarks,
    tbRemark ? `${REPORTED_MARKER} ${tbRemark}` : null,
    REPORTED_MARKER
  )

  const stiAnswer = yn(s.sti_or_hansens)
  form.syphilis_sti.remarks = upsertMarkedLine(
    form.syphilis_sti.remarks,
    stiAnswer ? `${REPORTED_MARKER} prior syphilis, gonorrhea, or Hansen's disease: ${stiAnswer}.` : null,
    REPORTED_MARKER
  )

  const mentalRemark = joinAnswers([
    ['Psychiatric diagnosis', yn(s.psychiatric_diagnosis)],
    ['Hospitalized/treated for mental health', yn(s.hospitalized_or_treated)],
    ['Thoughts of or attempted harm to self/others', yn(s.harm_thoughts)],
    ['DUI/DWI arrest or conviction', yn(s.dui_dwi)],
  ])
  form.physical_mental.remarks = upsertMarkedLine(
    form.physical_mental.remarks,
    mentalRemark ? `${REPORTED_MARKER} ${mentalRemark}` : null,
    REPORTED_MARKER
  )

  // medical_history carries two independent patient-reported lines (pregnancy,
  // allergies) under distinct markers; strip any legacy generic-marker line first.
  form.medical_history.remarks = upsertMarkedLine(form.medical_history.remarks, null, REPORTED_MARKER)

  const pregnancy = s.pregnant
    ? joinAnswers([
        ['Currently pregnant', s.pregnant === 'unsure' ? 'Unsure' : yn(s.pregnant)],
        ['Weeks / due date', s.pregnancy_weeks.trim() || null],
        ['Last menstrual period', s.last_menstrual_period.trim() || null],
      ])
    : ''
  form.medical_history.remarks = upsertMarkedLine(
    form.medical_history.remarks,
    pregnancy ? `${PREGNANCY_MARKER} ${pregnancy}` : null,
    PREGNANCY_MARKER
  )

  const allergyLine =
    s.has_allergies === 'no'
      ? 'None known.'
      : s.has_allergies === 'yes' && s.allergies.trim()
        ? s.allergies.trim()
        : null
  form.medical_history.remarks = upsertMarkedLine(
    form.medical_history.remarks,
    allergyLine ? `${ALLERGY_MARKER} ${allergyLine}` : null,
    ALLERGY_MARKER
  )

  for (const row of s.vaccinations) {
    if (row.notSure || row.haveRecord !== 'yes') continue
    const label = NURSE_VACCINE_ROWS.find((v) => v.key === row.key)?.label ?? row.key
    const existingRow = form.vaccinations.find(
      (x) => x.vaccine_name.trim().toLowerCase() === label.toLowerCase()
    )
    if (existingRow) {
      if (!existingRow.date_given.trim() && row.dates.trim()) existingRow.date_given = row.dates.trim()
      continue
    }
    form.vaccinations.push({
      vaccine_name: label,
      date_given: row.dates.trim(),
      waiver_reason: '',
      not_medically_appropriate: false,
    })
  }

  const unsure = s.vaccinations
    .filter((row) => row.notSure)
    .map((row) => NURSE_VACCINE_ROWS.find((v) => v.key === row.key)?.label ?? row.key)
  form.civil_surgeon.vaccination_remarks = upsertMarkedLine(
    form.civil_surgeon.vaccination_remarks,
    unsure.length > 0 ? `${UNSURE_MARKER} ${unsure.join(', ')}.` : null,
    UNSURE_MARKER
  )

  return form
}
