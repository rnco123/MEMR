import { occupationNameById } from '@/lib/intake/occupations'

/**
 * Deterministic SOAP section builders — pure functions over chart data, no
 * AI and no framework imports (kept separate from generate-soap.ts so they
 * are unit-testable). Subjective mirrors the patient-reported intake form;
 * Objective mirrors measured vitals + the clinician's physical exam.
 */

const s = (v: unknown) => (v == null ? '' : String(v).trim())
const arr = (v: unknown) =>
  Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean).join(', ') : s(v)

/** Patient-reported story from the intake form → Subjective. */
export function buildSubjectiveFromIntake(intake: Record<string, unknown> | null): string {
  if (!intake) return ''
  const lines: string[] = []

  if (s(intake.chief_complaint)) lines.push(`Chief complaint: ${s(intake.chief_complaint)}.`)
  if (s(intake.symptoms_description)) lines.push(`Patient reports ${s(intake.symptoms_description)}.`)
  if (s(intake.location)) lines.push(`Location: ${s(intake.location)}.`)
  if (s(intake.onset)) lines.push(`Onset: ${s(intake.onset)}.`)
  if (intake.severity != null && s(intake.severity)) lines.push(`Severity: ${s(intake.severity)}/10.`)
  if (s(intake.relieving_factors)) lines.push(`Relieving factors: ${s(intake.relieving_factors)}.`)

  if (arr(intake.medical_conditions)) lines.push(`Past medical history: ${arr(intake.medical_conditions)}.`)
  if (s(intake.cancer_type)) lines.push(`Cancer history: ${s(intake.cancer_type)}.`)
  if (arr(intake.surgeries)) lines.push(`Surgical history: ${arr(intake.surgeries)}.`)
  if (arr(intake.allergies)) lines.push(`Allergies: ${arr(intake.allergies)}.`)
  if (arr(intake.current_medications)) lines.push(`Current medications: ${arr(intake.current_medications)}.`)

  const social: string[] = []
  if (intake.tobacco_use != null) social.push(`tobacco ${intake.tobacco_use ? 'yes' : 'no'}`)
  if (intake.alcohol_use != null) social.push(`alcohol ${intake.alcohol_use ? 'yes' : 'no'}`)
  if (intake.drug_use != null) social.push(`recreational drugs ${intake.drug_use ? 'yes' : 'no'}`)
  if (social.length) lines.push(`Social history: ${social.join(', ')}.`)

  const fh: string[] = []
  if (intake.fh_diabetes) fh.push('diabetes')
  if (intake.fh_hypertension) fh.push('hypertension')
  if (intake.fh_cancer) fh.push('cancer')
  if (intake.fh_heart_disease) fh.push('heart disease')
  if (fh.length) lines.push(`Family history: ${fh.join(', ')}.`)

  if (intake.occupation != null && s(intake.occupation)) {
    const name = occupationNameById(Number(intake.occupation))
    lines.push(`Occupation: ${name ?? s(intake.occupation)}.`)
  }

  return lines.join('\n')
}

type VitalsLike = Record<string, unknown> | null

function formatVitalsLine(v: VitalsLike): string {
  if (!v) return ''
  const parts: string[] = []
  if (v.bp_systolic != null && v.bp_diastolic != null) parts.push(`BP ${v.bp_systolic}/${v.bp_diastolic} mmHg`)
  if (v.heart_rate != null) parts.push(`HR ${v.heart_rate} bpm`)
  if (v.respiratory_rate != null) parts.push(`RR ${v.respiratory_rate}/min`)
  if (v.temperature != null) parts.push(`Temp ${v.temperature}°${s(v.temperature_unit) || 'F'}`)
  if (v.spo2 != null) parts.push(`SpO2 ${v.spo2}%`)
  if (v.height != null && s(v.height)) parts.push(`Height ${s(v.height)}`)
  if (v.weight != null && s(v.weight)) parts.push(`Weight ${s(v.weight)}`)
  if (v.bmi != null) parts.push(`BMI ${Number(v.bmi).toFixed(1)}`)
  if (s(v.notes)) parts.push(`Notes: ${s(v.notes)}`)
  return parts.length ? `Vitals: ${parts.join('; ')}.` : ''
}

const PE_SYSTEM_LABELS: Array<[key: string, label: string]> = [
  ['general_appearance', 'General appearance'],
  ['eyes_ears_nose_throat', 'HEENT'],
  ['cardiovascular', 'Cardiovascular'],
  ['pulmonary', 'Pulmonary'],
  ['abdomen', 'Abdomen'],
  ['musculoskeletal', 'Musculoskeletal'],
  ['neurologic', 'Neurologic'],
  ['psychiatric', 'Psychiatric'],
  ['skin', 'Skin'],
  ['lymphatic', 'Lymphatic'],
  ['remarks', 'Remarks'],
]

/** Measured vitals + clinician exam findings → Objective. */
export function buildObjectiveFromChart(args: {
  patient?: { date_of_birth?: string | null; gender?: string | null } | null
  vitals: VitalsLike
  physicalExam: Record<string, unknown> | null
  rosExamText?: string | null
}): string {
  const lines: string[] = []

  const demo: string[] = []
  const dob = s(args.patient?.date_of_birth)
  if (dob) {
    const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))
    if (Number.isFinite(age) && age >= 0 && age < 130) demo.push(`${age}-year-old`)
  }
  if (s(args.patient?.gender)) demo.push(s(args.patient?.gender).toLowerCase())
  if (demo.length) lines.push(`Patient: ${demo.join(' ')}.`)

  const vitalsLine = formatVitalsLine(args.vitals)
  if (vitalsLine) lines.push(vitalsLine)

  const pe = args.physicalExam
  if (pe) {
    const findings = PE_SYSTEM_LABELS.map(([key, label]) => (s(pe[key]) ? `${label}: ${s(pe[key])}` : ''))
      .filter(Boolean)
      .join('\n')
    if (findings) lines.push(`Physical examination:\n${findings}`)
  }

  if (s(args.rosExamText)) lines.push(s(args.rosExamText))

  return lines.join('\n')
}
