import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { config } from '@/lib/config'
import {
  parsePatientSearchLocally,
  parsedPatientSearchFromFields,
} from '@/lib/nurse/patient-search-local'
import { parseSearchDateParts } from '@/lib/nurse/patient-search-query'
import { emptyParsedPatientSearch, type ParsedPatientSearch } from '@/lib/nurse/patient-search-types'

export { parsePatientSearchLocally } from '@/lib/nurse/patient-search-local'

export const PARSE_PATIENT_SEARCH_TOOL = 'parse_patient_search'

const parsePatientSearchInputSchema = z.object({
  search_intent: z.enum([
    'date_of_birth',
    'patient_id',
    'person_name',
    'email',
    'phone',
    'provider',
    'general',
  ]),
  patient_id: z.number().int().positive().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  dob_year: z.string().nullable(),
  dob_month: z.string().nullable(),
  dob_day: z.string().nullable(),
  provider_name: z.string().nullable(),
  general_query: z.string().nullable(),
})

const SYSTEM_PROMPT = `You parse clinic EMR patient search bar input into structured fields.

Rules:
- US clinics: prefer MM/DD/YYYY for dates (e.g. 6/08/1993 → month 06, day 08, year 1993).
- Any date-like input (slashes, dashes, dots, compact digits, month names) → search_intent date_of_birth with dob_year, dob_month, dob_day when known.
- Pure numeric ID (e.g. 12345) → search_intent patient_id.
- "First Last" or single name → person_name with first_name / last_name split when possible.
- Email with @ → email intent.
- Phone digits/formats → phone intent.
- Doctor/provider name when asked or clearly a provider → provider intent (only if requested in user message).
- Otherwise general intent with general_query as sanitized free text.
- Use null for unknown fields. Do not invent data not present in the query.`

function defaultModelName(): string {
  return process.env.OPENAI_PATIENT_SEARCH_MODEL?.trim() || 'gpt-4o-mini'
}

async function parsePatientSearchWithOpenAI(
  raw: string,
  options: { includeProvider?: boolean } = {}
): Promise<ParsedPatientSearch | null> {
  const key = (process.env.OPENAI_API_KEY || config.openai.apiKey || '').trim()
  if (!key) return null

  const trimmed = raw.trim()
  if (!trimmed) return emptyParsedPatientSearch(trimmed)

  const userContent = options.includeProvider
    ? `Parse this patient search query (provider names allowed):\n${trimmed}`
    : `Parse this patient search query (ignore provider names):\n${trimmed}`

  const result = await generateText({
    model: openai(defaultModelName()),
    system: SYSTEM_PROMPT,
    prompt: userContent,
    temperature: 0,
    maxOutputTokens: 400,
    tools: {
      [PARSE_PATIENT_SEARCH_TOOL]: {
        description: 'Structured patient search fields extracted from the search bar query.',
        inputSchema: parsePatientSearchInputSchema,
        execute: async (input) => input,
      },
    },
    toolChoice: { type: 'tool', toolName: PARSE_PATIENT_SEARCH_TOOL },
  })

  const call = result.toolCalls?.find((item) => item.toolName === PARSE_PATIENT_SEARCH_TOOL)
  if (!call || call.invalid) return null

  const parsed = parsePatientSearchInputSchema.safeParse(call.input)
  if (!parsed.success) return null

  return parsedPatientSearchFromFields(
    trimmed,
    parsed.data,
    'openai',
    Boolean(options.includeProvider)
  )
}

/** OpenAI tool parse first, then local regex/heuristic fallback. */
export async function resolvePatientSearch(
  raw: string,
  options: { includeProvider?: boolean } = {}
): Promise<ParsedPatientSearch> {
  const trimmed = raw.trim()
  if (!trimmed) return emptyParsedPatientSearch(trimmed)

  try {
    const aiParsed = await parsePatientSearchWithOpenAI(trimmed, options)
    if (aiParsed) {
      if (!aiParsed.dobFilter) {
        const dateParts = parseSearchDateParts(trimmed)
        if (dateParts) {
          return parsedPatientSearchFromFields(
            trimmed,
            {
              search_intent: 'date_of_birth',
              patient_id: null,
              first_name: null,
              last_name: null,
              email: null,
              phone: null,
              dob_year: dateParts.year ?? null,
              dob_month: dateParts.month ?? null,
              dob_day: dateParts.day ?? null,
              provider_name: null,
              general_query: null,
            },
            'local',
            Boolean(options.includeProvider)
          )
        }
      }
      return aiParsed
    }
  } catch (err) {
    console.warn('[resolvePatientSearch] OpenAI parse failed, using local fallback:', err)
  }

  return parsePatientSearchLocally(trimmed, options)
}
