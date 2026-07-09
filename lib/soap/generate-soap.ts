import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from '@/lib/config'
import { ValidationError } from '@/lib/api-error-handler'
import { loadIntakeForEncounter } from '@/lib/encounters/load-intake-for-encounter'
import { loadLatestVitalsForEncounter } from '@/lib/vitals/save-encounter-vitals'
import { loadEncounterPhysicalExamination } from '@/lib/encounter/physical-examination-store'
import { formatRosExamForContext } from '@/lib/encounter/physical-examination'
import { cleanSoapSection } from '@/lib/soap/clean-soap-section'
import { buildSubjectiveFromIntake, buildObjectiveFromChart } from '@/lib/soap/soap-sections'

/**
 * In-app SOAP note generation — replaces the env-dependent Railway
 * microservice so the EMR is self-contained.
 *
 * Ground truth first: Subjective is assembled deterministically from the
 * patient-reported intake form, Objective from measured vitals + the physical
 * examination (see lib/soap/soap-sections). AI never overwrites chart-derived
 * text — it only writes Assessment/Plan (clinical reasoning that can't be
 * derived mechanically) and fills Subjective/Objective when the chart has
 * nothing for them.
 *
 * Degrades gracefully: with no OpenAI key (or an AI failure) the chart-derived
 * sections still save, so SOAP keeps working with zero external dependencies.
 */

/** Clinical reasoning needs a step up from the gpt-4o-mini used for light tasks. */
const DEFAULT_SOAP_MODEL = 'gpt-4o'

export type GeneratedSoapNote = {
  subjective: string
  objective: string
  assessment: string
  plan: string
  /** 'full' = AI completed A/P; 'chart_only' = deterministic sections only. */
  mode: 'full' | 'chart_only'
  model: string | null
}

const s = (v: unknown) => (v == null ? '' : String(v).trim())

const AI_SYSTEM = `You are a clinical documentation assistant drafting SOAP notes for licensed clinicians to review in an outpatient/telehealth EMR.

STRICT RULES:
- Base every statement ONLY on the chart data provided. Never invent symptoms, findings, results, or history.
- This is a draft for clinician review, not medical advice or a final diagnosis.
- Concise professional clinical wording; no markdown, no section labels inside the text.

Respond with a JSON object only:
{
  "assessment": "clinical impression grounded in the data",
  "plan": "suggested next steps, numbered lines",
  "subjective": "only when asked, else empty string",
  "objective": "only when asked, else empty string"
}`

async function completeSoapWithOpenAI(args: {
  context: string
  needSubjective: boolean
  needObjective: boolean
}): Promise<{ assessment: string; plan: string; subjective: string; objective: string; model: string }> {
  const key = (process.env.OPENAI_API_KEY || config.openai.apiKey || '').trim()
  if (!key) throw new Error('OPENAI_API_KEY is not configured')
  const model = (process.env.OPENAI_SOAP_MODEL || DEFAULT_SOAP_MODEL).trim()

  const wants = [
    'Write the ASSESSMENT and PLAN.',
    args.needSubjective
      ? 'The chart has no intake data: also draft the SUBJECTIVE from whatever patient-reported information appears in the context.'
      : 'Subjective is already documented from the chart — return "" for subjective.',
    args.needObjective
      ? 'The chart has no vitals/exam data: also draft the OBJECTIVE from whatever measured information appears in the context.'
      : 'Objective is already documented from the chart — return "" for objective.',
  ].join('\n')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: AI_SYSTEM },
        { role: 'user', content: `${wants}\n\nCHART DATA:\n---\n${args.context}\n---` },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 300)}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const raw = data.choices?.[0]?.message?.content
  if (!raw) throw new Error('Empty OpenAI response')

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('Invalid JSON from OpenAI')
  }

  return {
    assessment: cleanSoapSection(s(parsed.assessment), 'assessment'),
    plan: cleanSoapSection(s(parsed.plan), 'plan'),
    subjective: cleanSoapSection(s(parsed.subjective), 'subjective'),
    objective: cleanSoapSection(s(parsed.objective), 'objective'),
    model,
  }
}

/**
 * Generate and persist the SOAP note for an encounter. Loads the chart,
 * builds deterministic Subjective/Objective, asks AI for Assessment/Plan
 * (and S/O only when the chart is empty for them), and inserts the row
 * into ai_soapnotes. Caller must have already authorized the user.
 */
export async function generateSoapNoteForEncounter(
  admin: SupabaseClient,
  encounterId: number
): Promise<GeneratedSoapNote> {
  const { data: enc, error: encErr } = await admin
    .from('encounters')
    .select('id, patient_id, intake_id, appointment_id')
    .eq('id', encounterId)
    .maybeSingle()
  if (encErr) throw encErr
  if (!enc) throw new ValidationError('Encounter not found')

  const intakeId = enc.intake_id != null && Number.isFinite(Number(enc.intake_id)) ? Number(enc.intake_id) : null
  const appointmentId =
    enc.appointment_id != null && Number.isFinite(Number(enc.appointment_id)) ? Number(enc.appointment_id) : null

  const [intake, vitals, peBundle, patientRes] = await Promise.all([
    loadIntakeForEncounter(admin, intakeId, appointmentId),
    loadLatestVitalsForEncounter(admin, encounterId),
    loadEncounterPhysicalExamination(admin, encounterId).catch(() => null),
    enc.patient_id != null
      ? admin.from('patients').select('date_of_birth, gender').eq('id', enc.patient_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const rosExamText = peBundle ? formatRosExamForContext(peBundle.ros_exam) : null
  const subjective = buildSubjectiveFromIntake(intake)
  const objective = buildObjectiveFromChart({
    patient: (patientRes?.data as { date_of_birth?: string | null; gender?: string | null } | null) ?? null,
    vitals: (vitals as Record<string, unknown> | null) ?? null,
    physicalExam: (peBundle?.physical_examination as Record<string, unknown> | null) ?? null,
    rosExamText,
  })

  if (!subjective && !objective) {
    throw new ValidationError(
      'No intake, vitals, or physical examination data available for this encounter yet.'
    )
  }

  const context = [
    subjective && `SUBJECTIVE (from intake):\n${subjective}`,
    objective && `OBJECTIVE (from vitals/exam):\n${objective}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  let note: GeneratedSoapNote = {
    subjective,
    objective,
    assessment: '',
    plan: '',
    mode: 'chart_only',
    model: null,
  }

  try {
    const ai = await completeSoapWithOpenAI({
      context,
      needSubjective: !subjective,
      needObjective: !objective,
    })
    note = {
      subjective: subjective || ai.subjective,
      objective: objective || ai.objective,
      assessment: ai.assessment,
      plan: ai.plan,
      mode: 'full',
      model: ai.model,
    }
  } catch (err) {
    // Chart-derived sections still save; the clinician writes A/P manually.
    console.error('[generate-soap] AI completion unavailable, saving chart-only note:', err)
  }

  const { error: insertErr } = await admin.from('ai_soapnotes').insert({
    encounter_id: encounterId,
    subjective_text: note.subjective || null,
    objective_text: note.objective || null,
    assessment_text: note.assessment || null,
    plan_text: note.plan || null,
  })
  if (insertErr) throw insertErr

  return note
}
