import { occupationNameById } from '@/lib/intake/occupations'

/**
 * Flatten intake + SOAP + vitals into a single string for clinical risk triage (LLM input).
 */

export function formatIntakeForRisk(intake: Record<string, unknown> | null): string {
  if (!intake || typeof intake !== 'object') return ''
  const lines: string[] = []
  const s = (v: unknown) => (v == null ? '' : String(v))

  if (intake.chief_complaint) lines.push(`Chief complaint: ${s(intake.chief_complaint)}`)
  if (intake.symptoms_description) lines.push(`Symptoms: ${s(intake.symptoms_description)}`)
  if (intake.location) lines.push(`Location: ${s(intake.location)}`)
  if (intake.severity != null) lines.push(`Severity (0–10): ${s(intake.severity)}`)
  if (intake.onset) lines.push(`Onset: ${s(intake.onset)}`)

  const arr = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean).join(', ') : s(v)

  if (intake.medical_conditions) lines.push(`Medical conditions: ${arr(intake.medical_conditions)}`)
  if (intake.allergies) lines.push(`Allergies: ${arr(intake.allergies)}`)
  if (intake.current_medications) lines.push(`Medications: ${arr(intake.current_medications)}`)
  if (intake.surgeries) lines.push(`Surgeries: ${arr(intake.surgeries)}`)
  if (intake.cancer_type) lines.push(`Cancer type: ${s(intake.cancer_type)}`)

  lines.push(
    `Tobacco: ${intake.tobacco_use ? 'yes' : 'no'}, Alcohol: ${intake.alcohol_use ? 'yes' : 'no'}, Drugs: ${intake.drug_use ? 'yes' : 'no'}`
  )

  const fh: string[] = []
  if (intake.fh_diabetes) fh.push('diabetes')
  if (intake.fh_hypertension) fh.push('hypertension')
  if (intake.fh_cancer) fh.push('cancer')
  if (intake.fh_heart_disease) fh.push('heart disease')
  if (fh.length) lines.push(`Family history: ${fh.join(', ')}`)

  if (intake.occupation != null) {
    const name = occupationNameById(Number(intake.occupation))
    lines.push(`Occupation: ${name ?? s(intake.occupation)}`)
  }

  return lines.filter(Boolean).join('\n')
}

export function formatSoapForRisk(soap: {
  subjective_text?: string | null
  objective_text?: string | null
  assessment_text?: string | null
  plan_text?: string | null
} | null): string {
  if (!soap) return ''
  const parts: string[] = []
  if (soap.subjective_text?.trim()) parts.push(`Subjective:\n${soap.subjective_text.trim()}`)
  if (soap.objective_text?.trim()) parts.push(`Objective:\n${soap.objective_text.trim()}`)
  if (soap.assessment_text?.trim()) parts.push(`Assessment:\n${soap.assessment_text.trim()}`)
  if (soap.plan_text?.trim()) parts.push(`Plan:\n${soap.plan_text.trim()}`)
  return parts.join('\n\n')
}

export function formatVitalsForRisk(v: Record<string, unknown> | null): string {
  if (!v) return ''
  const parts: string[] = []
  if (v.bp_systolic != null && v.bp_diastolic != null) {
    parts.push(`BP ${v.bp_systolic}/${v.bp_diastolic} mmHg`)
  }
  if (v.heart_rate != null) parts.push(`HR ${v.heart_rate} bpm`)
  if (v.respiratory_rate != null) parts.push(`RR ${v.respiratory_rate}`)
  if (v.temperature != null) parts.push(`Temp ${v.temperature}°${v.temperature_unit || 'F'}`)
  if (v.spo2 != null) parts.push(`SpO2 ${v.spo2}%`)
  if (v.bmi != null) parts.push(`BMI ${Number(v.bmi).toFixed(1)}`)
  if (v.notes && String(v.notes).trim()) parts.push(`Vitals notes: ${String(v.notes).trim()}`)
  return parts.length ? `Vitals: ${parts.join('; ')}` : ''
}
