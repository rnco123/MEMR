import { z } from 'zod'
import type { I693FormData } from '@/lib/i693/types'
import { mergeI693Form } from '@/lib/i693/types'
import { I693_UI_SECTIONS, getNestedValue, setNestedValue } from '@/lib/i693/field-sections'

const emptyToUndefined = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const triState = z.union([z.boolean(), z.null()]).optional()
const stringField = z.string().trim().optional()

const applicantSchema = z.object({
  family_name: stringField,
  given_name: stringField,
  middle_name: stringField,
  in_care_of: stringField,
  street: stringField,
  apt: stringField,
  city: stringField,
  state: stringField,
  zip: stringField,
  province: stringField,
  postal_code: stringField,
  country: stringField,
  date_of_birth: stringField,
  city_of_birth: stringField,
  state_of_birth: stringField,
  country_of_birth: stringField,
  country_of_citizenship: stringField,
  a_number: stringField,
  uscis_online_account: stringField,
  passport_number: stringField,
  sex: z.enum(['', 'male', 'female']).optional(),
  eligibility_category: stringField,
}).partial()

const applicationSchema = z.object({
  immigration_benefit: stringField,
  city_where_filed: stringField,
  state_where_filed: stringField,
  class_of_admission: stringField,
  receipt_number: stringField,
  consulate_location: stringField,
  remarks: stringField,
}).partial()

const uscisRecordsSchema = z.object({
  request_records: triState,
  form_type: stringField,
  receipt_number: stringField,
  remarks: stringField,
}).partial()

const applicantContactSchema = z.object({
  day_phone: stringField,
  mobile_phone: stringField,
  email: stringField,
  applicant_signature_date: stringField,
  can_read_english: triState,
  remarks: stringField,
  id_document_type: stringField,
  id_document_number: stringField,
}).partial()

const interpreterSchema = z.object({
  used_interpreter: triState,
  interpreter_name: stringField,
  interpreter_organization: stringField,
  interpreter_phone: stringField,
  interpreter_email: stringField,
  interpreter_signature_date: stringField,
}).partial()

const preparerSchema = z.object({
  prepared_by_other: triState,
  preparer_name: stringField,
  preparer_organization: stringField,
  preparer_phone: stringField,
  preparer_email: stringField,
  preparer_signature_date: stringField,
}).partial()

const medicalHistorySchema = z.object({
  height: stringField,
  weight: stringField,
  bmi: stringField,
  blood_pressure: stringField,
  pulse: stringField,
  temperature: stringField,
  general_appearance: stringField,
  eyes_ears_nose_throat: stringField,
  cardiovascular: stringField,
  pulmonary: stringField,
  abdomen: stringField,
  musculoskeletal: stringField,
  neurologic: stringField,
  psychiatric: stringField,
  skin: stringField,
  lymphatic: stringField,
  remarks: stringField,
}).partial()

const tbScreeningSchema = z.object({
  tuberculin_skin_test: stringField,
  quantiferon_t_spot: stringField,
  chest_xray: stringField,
  classification: stringField,
  treatment: stringField,
  remarks: stringField,
}).partial()

const syphilisStiSchema = z.object({
  syphilis_test_type: stringField,
  syphilis_result: stringField,
  syphilis_date: stringField,
  nonreactive_date_reported: stringField,
  screening_titer: stringField,
  gonorrhea_result: stringField,
  gonorrhea_date: stringField,
  other_sti: stringField,
  remarks: stringField,
}).partial()

const physicalMentalSchema = z.object({
  class_a_conditions: stringField,
  class_b_conditions: stringField,
  harmful_behavior: stringField,
  remarks: stringField,
}).partial()

const drugAbuseSchema = z.object({
  class_a: stringField,
  class_b: stringField,
  in_remission: stringField,
  remarks: stringField,
}).partial()

const otherConditionsSchema = z.object({
  conditions: stringField,
  remarks: stringField,
}).partial()

const vaccinationSchema = z.object({
  vaccine_name: stringField,
  date_given: stringField,
  waiver_reason: stringField,
  not_medically_appropriate: z.boolean().optional(),
}).partial()

const vaccinationGridSchema = z.object({
  vaccineCode: z.string().trim().min(1),
  dateGiven: stringField,
  dateReceived: stringField,
  datesReceived: z.array(z.string().trim()).optional(),
  completeSeries: z.boolean().optional(),
  contraindicated: z.boolean().optional(),
  insufficientInterval: z.boolean().optional(),
  notAgeAppropriate: z.boolean().optional(),
  immune: z.boolean().optional(),
  historyOfDisease: z.boolean().optional(),
})

const civilSurgeonSchema = z.object({
  surgeon_name: stringField,
  practice_name: stringField,
  street: stringField,
  apt: stringField,
  city: stringField,
  state: stringField,
  zip: stringField,
  phone: stringField,
  email: stringField,
  medical_license: stringField,
  emedical_id: stringField,
  date_signed: stringField,
  vaccinations_complete: triState,
  vaccination_remarks: stringField,
  summary_remarks: stringField,
  summary_overall: stringField,
}).partial()

export const i693AiDraftFormSchema = z.object({
  applicant: applicantSchema.optional(),
  application: applicationSchema.optional(),
  uscis_records: uscisRecordsSchema.optional(),
  applicant_contact: applicantContactSchema.optional(),
  interpreter: interpreterSchema.optional(),
  preparer: preparerSchema.optional(),
  medical_history: medicalHistorySchema.optional(),
  tb_screening: tbScreeningSchema.optional(),
  syphilis_sti: syphilisStiSchema.optional(),
  physical_mental: physicalMentalSchema.optional(),
  drug_abuse: drugAbuseSchema.optional(),
  other_conditions: otherConditionsSchema.optional(),
  vaccinations: z.array(vaccinationSchema).optional(),
  vaccination_grid: z.array(vaccinationGridSchema).optional(),
  civil_surgeon: civilSurgeonSchema.optional(),
  pdf_widget_values: z.record(z.string(), z.string().trim()).optional(),
}).partial()

export const i693AiDraftEvidenceSchema = z.object({
  field: z.string().trim().min(1),
  value: z.string().trim().optional(),
  source_document: z.string().trim().optional(),
  source_quote: z.string().trim().min(1),
})

export const i693AiDraftToolInputSchema = z.object({
  form_data: i693AiDraftFormSchema,
  evidence: z.array(i693AiDraftEvidenceSchema).default([]),
  warnings: z.array(z.string().trim()).default([]),
})

export type I693AiDraftEvidence = z.infer<typeof i693AiDraftEvidenceSchema>
export type I693AiDraftToolInput = z.infer<typeof i693AiDraftToolInputSchema>

export type NormalizedI693AiDraft = {
  form: I693FormData
  evidence: I693AiDraftEvidence[]
  warnings: string[]
  filledFields: string[]
}

const NON_FACTUAL_VALUES = new Set([
  'unknown',
  'not documented',
  'not documented in chart',
  'not documented in source',
  'n/a',
  'na',
  'none documented',
  'not available',
])

function isMeaningfulValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some(isMeaningfulValue)
  if (typeof value === 'object') return Object.values(value).some(isMeaningfulValue)
  const text = String(value).trim()
  if (!text) return false
  return !NON_FACTUAL_VALUES.has(text.toLowerCase())
}

function clearValueAtPath(form: I693FormData, path: string): void {
  const root = form as unknown as Record<string, unknown>
  const current = getNestedValue(root, path)
  if (typeof current === 'boolean') setNestedValue(root, path, null)
  else setNestedValue(root, path, '')
}

function normalizeEvidenceField(field: string): string {
  return field
    .trim()
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\[\]/g, '')
    .replace(/\s+/g, '')
}

function evidenceMatchesPath(evidenceField: string, path: string): boolean {
  const ev = normalizeEvidenceField(evidenceField)
  const target = normalizeEvidenceField(path)
  return ev === target || ev.startsWith(`${target}.`) || target.startsWith(`${ev}.`)
}

function hasEvidenceForPath(evidence: I693AiDraftEvidence[], path: string): boolean {
  return evidence.some((item) => item.source_quote?.trim() && evidenceMatchesPath(item.field, path))
}

function collectFilledFieldPaths(form: I693FormData): string[] {
  const root = form as unknown as Record<string, unknown>
  const fields: string[] = []

  for (const section of I693_UI_SECTIONS) {
    for (const field of section.fields) {
      if (isMeaningfulValue(getNestedValue(root, field.key))) fields.push(field.key)
    }
  }

  form.vaccinations.forEach((row, index) => {
    if (isMeaningfulValue(row.vaccine_name)) fields.push(`vaccinations.${index}.vaccine_name`)
    if (isMeaningfulValue(row.date_given)) fields.push(`vaccinations.${index}.date_given`)
    if (isMeaningfulValue(row.waiver_reason)) fields.push(`vaccinations.${index}.waiver_reason`)
    if (row.not_medically_appropriate) fields.push(`vaccinations.${index}.not_medically_appropriate`)
  })

  form.vaccination_grid.forEach((row) => {
    for (const [key, value] of Object.entries(row)) {
      if (key === 'vaccineCode') continue
      if (isMeaningfulValue(value)) fields.push(`vaccination_grid.${row.vaccineCode}.${key}`)
    }
  })

  for (const [key, value] of Object.entries(form.pdf_widget_values ?? {})) {
    if (isMeaningfulValue(value)) fields.push(`pdf_widget_values.${key}`)
  }

  return fields
}

function stripUnsupportedPlaceholders(form: I693FormData): I693FormData {
  const next = structuredClone(form) as I693FormData
  const root = next as unknown as Record<string, unknown>

  for (const section of I693_UI_SECTIONS) {
    for (const field of section.fields) {
      const value = getNestedValue(root, field.key)
      if (typeof value === 'string' && !isMeaningfulValue(value)) clearValueAtPath(next, field.key)
    }
  }

  next.vaccinations = next.vaccinations.filter((row) => (
    isMeaningfulValue(row.vaccine_name) ||
    isMeaningfulValue(row.date_given) ||
    isMeaningfulValue(row.waiver_reason) ||
    row.not_medically_appropriate
  ))

  if (next.pdf_widget_values) {
    const kept: Record<string, string> = {}
    for (const [key, value] of Object.entries(next.pdf_widget_values)) {
      const trimmed = emptyToUndefined(value)
      if (trimmed && isMeaningfulValue(trimmed)) kept[key] = trimmed
    }
    next.pdf_widget_values = Object.keys(kept).length > 0 ? kept : undefined
  }

  return mergeI693Form(next)
}

export function normalizeAiGeneratedI693Draft(raw: unknown): NormalizedI693AiDraft {
  const parsed = i693AiDraftToolInputSchema.parse(raw)
  let form = stripUnsupportedPlaceholders(mergeI693Form(parsed.form_data as Partial<I693FormData>))
  const evidence = parsed.evidence.filter((item) => item.source_quote.trim())
  const warnings = parsed.warnings.filter(Boolean)

  for (const path of collectFilledFieldPaths(form)) {
    if (hasEvidenceForPath(evidence, path)) continue
    if (path.startsWith('vaccinations.')) continue
    if (path.startsWith('vaccination_grid.')) continue
    if (path.startsWith('pdf_widget_values.')) {
      const key = path.replace(/^pdf_widget_values\./, '')
      if (form.pdf_widget_values) delete form.pdf_widget_values[key]
      continue
    }
    clearValueAtPath(form, path)
  }

  if (form.vaccinations.length > 0 && !hasEvidenceForPath(evidence, 'vaccinations')) {
    form.vaccinations = []
  }

  form.vaccination_grid = form.vaccination_grid.map((row) => {
    const rowHasEvidence = hasEvidenceForPath(evidence, `vaccination_grid.${row.vaccineCode}`)
    if (rowHasEvidence) return row
    return { vaccineCode: row.vaccineCode }
  })

  form = mergeI693Form(form)

  return {
    form,
    evidence,
    warnings,
    filledFields: collectFilledFieldPaths(form),
  }
}
