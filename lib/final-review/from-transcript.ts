export interface PrescriptionSuggestion {
  medication_name: string
  strength: string
  dosage_instruction: string
  route: string
  frequency: string
  duration: string
  notes: string | null
  source_quote?: string | null
}

export interface FollowUpSuggestion {
  needed: boolean
  suggested_date: string | null
  suggested_time: string | null
  timeframe_text: string | null
  reason: string | null
}

export interface FinalReviewSuggestions {
  prescriptions: PrescriptionSuggestion[]
  follow_up: FollowUpSuggestion
  unmatched_medications: string[]
}

const MAX_LIST_SIZE = 10

export function formatTranscriptDialogue(
  lines: Array<{ speaker_role: string; speaker_name: string; message: string }>
): string {
  return lines
    .map((l) => `[${l.speaker_role.toUpperCase()}] ${l.speaker_name}: ${l.message}`)
    .join('\n')
}

export function buildFinalReviewSystemPrompt(
  visitDateIso: string
): string {
  return `You are a clinical documentation assistant for a telemedicine EMR Final Review workflow.
Given a session transcript (and optional prior clinical summary), extract structured suggestions in English only.

Visit reference date (for follow-up date math): ${visitDateIso}

Return ONLY valid JSON with this exact shape:
{
  "prescriptions": [
    {
      "medication_name": "Amoxicillin",
      "strength": "500 mg",
      "dosage_instruction": "1 capsule",
      "route": "oral",
      "frequency": "three times daily",
      "duration": "7 days",
      "notes": null,
      "source_quote": "short verbatim quote"
    }
  ],
  "follow_up": {
    "needed": true,
    "suggested_date": "YYYY-MM-DD or null",
    "suggested_time": "HH:MM (24h) or null",
    "timeframe_text": "e.g. in two weeks",
    "reason": "why patient should return"
  },
  "unmatched_medications": ["medications mentioned but not parsed as prescriptions"]
}

Rules:
- prescriptions: only medications prescribed or explicitly ordered for the patient; parse dose/route/frequency/duration when spoken; use empty string if not stated.
- follow_up: if a return visit is mentioned, set needed true and compute suggested_date from timeframe_text relative to visit reference date; default suggested_time to "10:00" if time not stated.
- Put OTC or unclear medications in unmatched_medications.
- Do not include markdown or explanation outside JSON.`
}

export function buildFinalReviewUserContent(
  dialogue: string,
  transcriptSummary: Record<string, unknown> | null
): string {
  const summaryBlock = transcriptSummary
    ? `\n\nPrior clinical summary (hint):\n${JSON.stringify(transcriptSummary, null, 2)}`
    : ''
  return `Session transcript:\n\n${dialogue}${summaryBlock}`
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s || null
}

export function validateFinalReviewSuggestions(
  raw: Record<string, unknown>
): FinalReviewSuggestions {
  const rxRaw = Array.isArray(raw.prescriptions) ? raw.prescriptions : []
  const prescriptions: PrescriptionSuggestion[] = []
  for (const item of rxRaw.slice(0, MAX_LIST_SIZE)) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const medication_name = asString(row.medication_name).trim()
    if (!medication_name) continue
    prescriptions.push({
      medication_name,
      strength: asString(row.strength),
      dosage_instruction: asString(row.dosage_instruction),
      route: asString(row.route),
      frequency: asString(row.frequency),
      duration: asString(row.duration),
      notes: asNullableString(row.notes),
      source_quote: asNullableString(row.source_quote),
    })
  }

  const fuRaw =
    raw.follow_up && typeof raw.follow_up === 'object'
      ? (raw.follow_up as Record<string, unknown>)
      : {}
  const follow_up: FollowUpSuggestion = {
    needed: Boolean(fuRaw.needed),
    suggested_date: asNullableString(fuRaw.suggested_date),
    suggested_time: asNullableString(fuRaw.suggested_time),
    timeframe_text: asNullableString(fuRaw.timeframe_text),
    reason: asNullableString(fuRaw.reason),
  }

  const unmatched_medications = (
    Array.isArray(raw.unmatched_medications) ? raw.unmatched_medications : []
  )
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_SIZE)

  return {
    prescriptions,
    follow_up,
    unmatched_medications,
  }
}
