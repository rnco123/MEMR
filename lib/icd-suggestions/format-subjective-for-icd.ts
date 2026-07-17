/**
 * Subjective-only text for ICD-10-CM suggestion (intake + optional AI SOAP subjective).
 */

function str(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function arr(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map((x) => str(x)).filter(Boolean).join(', ')
  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed)) return parsed.map((x) => str(x)).filter(Boolean).join(', ')
      } catch {
        /* plain text */
      }
    }
    return trimmed
  }
  return str(v)
}

/**
 * Maps intake rows to the prompt's "INPUT DATA (Subjective)" fields.
 */
export function formatIntakeSubjectiveForIcd(intake: Record<string, unknown> | null): string {
  if (!intake || typeof intake !== 'object') return ''

  const lines: string[] = []

  if (intake.chief_complaint) lines.push(`Reason for Visit: ${str(intake.chief_complaint)}`)
  if (intake.symptoms_description) lines.push(`Symptom Details: ${str(intake.symptoms_description)}`)
  if (intake.onset) lines.push(`Duration / Onset: ${str(intake.onset)}`)
  if (intake.location) lines.push(`Location of Symptoms: ${str(intake.location)}`)
  if (intake.severity != null) lines.push(`Severity (1–10): ${str(intake.severity)}`)
  if (intake.relieving_factors != null && str(intake.relieving_factors))
    lines.push(`Relieving Factors: ${arr(intake.relieving_factors)}`)
  if (intake.current_medications) lines.push(`Current Medications: ${arr(intake.current_medications)}`)
  if (intake.medical_conditions) lines.push(`Medical Conditions (self-reported): ${arr(intake.medical_conditions)}`)

  return lines.filter(Boolean).join('\n')
}

export function formatSoapSubjectiveOnly(soap: {
  subjective_text?: string | null
} | null): string {
  return soap?.subjective_text?.trim() ?? ''
}

export function buildIcdUserPayload(intakeBlock: string, soapSubjective: string): string {
  const parts: string[] = []
  if (intakeBlock.trim()) {
    parts.push('=== INTAKE (Subjective) ===\n' + intakeBlock.trim())
  }
  if (soapSubjective.trim()) {
    parts.push('=== AI SOAP NOTE — Subjective section only ===\n' + soapSubjective.trim())
  }
  return parts.join('\n\n')
}
