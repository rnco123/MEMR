import { config } from '@/lib/config'

export type IcdSuggestionItem = {
  code: string
  description: string
  confidence: number
  reasoning: string
}

export type IcdSuggestResult =
  | { ok: true; icd_suggestions: IcdSuggestionItem[] }
  | { ok: false; message: string }

const SYSTEM = `You are a medical coding assistant specialized in ICD-10-CM.

Your task is to analyze ONLY SUBJECTIVE patient intake data and suggest the most relevant ICD-10 codes.

INPUT DATA (Subjective):
- Reason for Visit
- Symptom Details
- Duration
- Location of Symptoms
- Severity (1–10)
- Relieving Factors
- Current Medications
- Medical Conditions (self-reported)

INSTRUCTIONS:
1. Extract key medical concepts (symptoms, conditions, body part, duration).
2. Map them to the most relevant ICD-10-CM codes.
3. Return TOP 3 most likely ICD codes.
4. Include:
   - Code
   - Description
   - Confidence score (0–100)
5. If diagnosis is uncertain, prefer symptom-based codes (e.g., pain, cough).
6. Do NOT assume confirmed diagnosis — this is pre-clinical suggestion only.
7. If multiple body locations exist, include laterality when possible (left/right).
8. Keep output structured JSON only.

OUTPUT FORMAT:
{
  "icd_suggestions": [
    {
      "code": "string",
      "description": "string",
      "confidence": number,
      "reasoning": "short explanation based on symptoms"
    }
  ]
}

EXAMPLE INPUT:
Reason for Visit: Wart removal
Symptom Details: small growth on hand
Duration: 2 months
Location: Hand
Severity: 2

EXAMPLE OUTPUT:
{
  "icd_suggestions": [
    {
      "code": "B07.9",
      "description": "Viral wart, unspecified",
      "confidence": 92,
      "reasoning": "Growth on hand consistent with wart"
    },
    {
      "code": "B07.8",
      "description": "Other viral warts",
      "confidence": 85,
      "reasoning": "Possible subtype of wart"
    }
  ]
}`

/**
 * Single OpenAI call. On any failure or unusable output, caller should treat as "can't find ICD".
 */
export async function suggestIcdCodesFromSubjective(userPayload: string): Promise<IcdSuggestResult> {
  const key = (process.env.OPENAI_API_KEY || config.openai.apiKey || '').trim()
  if (!key) {
    return { ok: false, message: "AI can't find ICD code" }
  }

  const content =
    userPayload.trim() ||
    'No subjective intake or SOAP text was provided. Return {"icd_suggestions":[]}.'

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_ICD_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Analyze the following subjective data and return JSON only in the required shape.\n\n---\n${content}\n---`,
        },
      ],
    }),
  })

  if (!res.ok) {
    return { ok: false, message: "AI can't find ICD code" }
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const raw = data.choices?.[0]?.message?.content
  if (!raw) {
    return { ok: false, message: "AI can't find ICD code" }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return { ok: false, message: "AI can't find ICD code" }
  }

  const obj = parsed as Record<string, unknown>
  const list = obj.icd_suggestions
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, message: "AI can't find ICD code" }
  }

  const out: IcdSuggestionItem[] = []
  for (const item of list.slice(0, 3)) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const code = typeof rec.code === 'string' ? rec.code.trim() : ''
    const description = typeof rec.description === 'string' ? rec.description.trim() : ''
    const reasoning = typeof rec.reasoning === 'string' ? rec.reasoning.trim() : ''
    let confidence = Number(rec.confidence)
    if (!Number.isFinite(confidence)) confidence = 0
    confidence = Math.min(100, Math.max(0, Math.round(confidence)))
    if (code && description) {
      out.push({ code, description, confidence, reasoning: reasoning || '—' })
    }
  }

  if (out.length === 0) {
    return { ok: false, message: "AI can't find ICD code" }
  }

  return { ok: true, icd_suggestions: out }
}
