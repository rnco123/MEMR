import { config } from '@/lib/config'

export type RiskLevel = 'low' | 'medium' | 'severe'

export type RiskAlertResult = {
  level: RiskLevel
  rationale: string
  factors: string[]
}

const SYSTEM = `You are a clinical decision support assistant for registered nurses triaging patients in an outpatient / telehealth setting.
You MUST NOT diagnose. You only estimate an acuity / safety risk level for nursing awareness based on the text provided.

Respond with a JSON object only (no markdown), with this exact shape:
{
  "level": "low" | "medium" | "severe",
  "rationale": "1-3 short sentences for the nurse",
  "factors": ["short bullet", "short bullet", ...]
}

Definitions:
- "low": stable presentation, routine follow-up, no red flags.
- "medium": needs closer monitoring, moderate concern, or comorbidities that raise caution.
- "severe": possible emergency, high-risk symptoms, unstable vitals, severe bleeding, stroke-like symptoms, chest pain, respiratory failure signs, or similar — nurse should prioritize and escalate per protocol.

If information is sparse, lean conservative (medium) when uncertain.`

export async function analyzeClinicalRisk(clinicalText: string): Promise<RiskAlertResult> {
  const key = (process.env.OPENAI_API_KEY || config.openai.apiKey || '').trim()
  if (!key) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const userContent =
    clinicalText.trim() ||
    'No clinical text was provided. Respond with level "low", rationale explaining no data, and empty factors.'

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_RISK_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Analyze the following clinical context and return JSON only.\n\n---\n${userContent}\n---`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 500)}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const raw = data.choices?.[0]?.message?.content
  if (!raw) {
    throw new Error('Empty OpenAI response')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error('Invalid JSON from OpenAI')
  }

  const obj = parsed as Record<string, unknown>
  const levelRaw = String(obj.level || '').toLowerCase()
  const level: RiskLevel =
    levelRaw === 'severe' || levelRaw === 'high'
      ? 'severe'
      : levelRaw === 'medium' || levelRaw === 'moderate'
        ? 'medium'
        : 'low'

  const rationale = typeof obj.rationale === 'string' ? obj.rationale : 'Risk assessment completed.'
  const factors = Array.isArray(obj.factors)
    ? obj.factors.map((f) => String(f)).filter(Boolean)
    : []

  return { level, rationale, factors }
}
