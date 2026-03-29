'use client'

/** Structured one-glance summary from intake (not AI-generated; rule-based text). */

interface IntakeLike {
  chief_complaint?: string | null
  symptoms_description?: string | null
  allergies?: unknown
  current_medications?: unknown
  medical_conditions?: unknown
}

interface Props {
  intake: IntakeLike | null
  patientName?: string
}

export function PreVisitSummary({ intake, patientName }: Props) {
  if (!intake) return null

  const allergies = Array.isArray(intake.allergies)
    ? intake.allergies.filter(Boolean).join(', ')
    : null
  const meds = Array.isArray(intake.current_medications)
    ? intake.current_medications.filter(Boolean).join(', ')
    : null
  const conditions = Array.isArray(intake.medical_conditions)
    ? intake.medical_conditions.filter(Boolean).join(', ')
    : null

  const lines: string[] = []
  if (intake.chief_complaint) lines.push(`Chief complaint: ${intake.chief_complaint}`)
  if (intake.symptoms_description) lines.push(`Symptoms: ${intake.symptoms_description}`)
  if (allergies) lines.push(`Allergies: ${allergies}`)
  else lines.push('Allergies: none documented')
  if (meds) lines.push(`Current medications: ${meds}`)
  if (conditions) lines.push(`Conditions: ${conditions}`)

  if (lines.length === 0) return null

  return (
    <div className="rounded-lg border border-cyan-500/40 bg-cyan-950/40 p-3 text-xs text-cyan-100">
      <p className="font-semibold text-cyan-200 mb-1">Pre-visit summary</p>
      {patientName ? <p className="text-white font-medium mb-1">{patientName}</p> : null}
      <ul className="list-disc list-inside space-y-0.5 text-gray-200">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  )
}
