import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

/** Anthropic rejects requests over 32 MB; keep well under it after base64 expansion. */
export const TB_ANALYSIS_MAX_PDF_BYTES = 20 * 1024 * 1024

/** Below this the text layer is assumed absent (scanned report) and the PDF is sent instead. */
const MIN_TEXT_LAYER_CHARS = 200
/** Bounds the worst case on a report padded with pages of boilerplate. */
const MAX_TEXT_CHARS = 60_000
const MAX_TEXT_PAGES = 20

const ASSAY_VALUES = ['quantiferon_plus', 'quantiferon_other', 'tspot', 'other', 'unknown'] as const

const extractedValuesSchema = z.object({
  assay: z.enum(ASSAY_VALUES),
  units: z.string().nullable(),
  nil: z.number().nullable(),
  tb1_nil: z.number().nullable(),
  tb2_nil: z.number().nullable(),
  mitogen_nil: z.number().nullable(),
  raw: z.object({
    nil: z.string().nullable(),
    tb1_nil: z.string().nullable(),
    tb2_nil: z.string().nullable(),
    mitogen_nil: z.string().nullable(),
  }),
  specimen_collected_on: z.string().nullable(),
  extraction_confidence: z.number(),
  notes: z.string(),
})

export type ExtractedQftValues = z.infer<typeof extractedValuesSchema>

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] }
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] }

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'assay',
    'units',
    'nil',
    'tb1_nil',
    'tb2_nil',
    'mitogen_nil',
    'raw',
    'specimen_collected_on',
    'extraction_confidence',
    'notes',
  ],
  properties: {
    assay: {
      type: 'string',
      enum: [...ASSAY_VALUES],
      description: 'Which assay the report documents. Use unknown when it cannot be determined.',
    },
    units: { ...nullableString, description: 'Units printed for the quantitative results, e.g. IU/mL.' },
    nil: { ...nullableNumber, description: 'Nil (negative control) value.' },
    tb1_nil: { ...nullableNumber, description: 'TB1 minus Nil.' },
    tb2_nil: { ...nullableNumber, description: 'TB2 minus Nil.' },
    mitogen_nil: { ...nullableNumber, description: 'Mitogen minus Nil.' },
    raw: {
      type: 'object',
      additionalProperties: false,
      required: ['nil', 'tb1_nil', 'tb2_nil', 'mitogen_nil'],
      properties: {
        nil: nullableString,
        tb1_nil: nullableString,
        tb2_nil: nullableString,
        mitogen_nil: nullableString,
      },
      description: 'Each value exactly as printed, preserving censoring such as ">10.0" or "<0.05".',
    },
    specimen_collected_on: { ...nullableString, description: 'Collection date as printed.' },
    extraction_confidence: {
      type: 'number',
      description: 'Between 0 and 1: how confident you are that the values were read correctly.',
    },
    notes: {
      type: 'string',
      description:
        'Anything the reviewer must know, under 20 words. Empty string when there is nothing.',
    },
  },
} as const

const SYSTEM_PROMPT = `You read QuantiFERON-TB (interferon-gamma release assay) laboratory reports and extract the quantitative results.

Extract the four values the QFT-Plus interpretation algorithm needs, in IU/mL:
- nil: the Nil negative-control value
- tb1_nil: TB1 minus Nil
- tb2_nil: TB2 minus Nil
- mitogen_nil: Mitogen minus Nil

How to read them:
- Most reports print the antigen tubes already nil-subtracted, often labelled "TB1-Nil" or "TB1 minus Nil". Use those directly. If only raw TB1, TB2, and Mitogen values are printed, subtract Nil yourself.
- Copy each value into the raw object exactly as printed, including censoring such as ">10.0" or "<0.05", and put the numeric bound in the corresponding numeric field.
- If the results are in units other than IU/mL, convert to IU/mL, put the converted number in the numeric field, and say so in notes.
- Set a value to null when it is absent or unreadable. Never infer or estimate a value that is not on the report.
- Set assay to tspot for T-SPOT.TB reports (spot counts, not IU/mL) and to other when the document is not an IGRA report at all.

Do not classify the result as positive, negative, or indeterminate — a separate validated rule engine does that from the values you return. extraction_confidence describes only how reliably you could read the numbers off the page.`

function defaultModel(): string {
  return process.env.ANTHROPIC_TB_MODEL?.trim() || 'claude-opus-5'
}

export class TbAnalysisConfigError extends Error {}
export class TbAnalysisExtractionError extends Error {}

/**
 * Pull the PDF's text layer so the report can be sent as text rather than as page images,
 * which is what actually drives the token cost. Returns null for scanned reports.
 */
async function readPdfTextLayer(bytes: Uint8Array): Promise<string | null> {
  try {
    const mupdf = await import(/* webpackIgnore: true */ 'mupdf')
    const doc = mupdf.Document.openDocument(bytes, 'application/pdf')
    const pageCount = Math.min(doc.countPages(), MAX_TEXT_PAGES)

    const pages: string[] = []
    for (let index = 0; index < pageCount; index++) {
      pages.push(doc.loadPage(index).toStructuredText().asText())
    }

    const text = pages.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    if (text.length < MIN_TEXT_LAYER_CHARS) return null
    return text.slice(0, MAX_TEXT_CHARS)
  } catch {
    return null
  }
}

/**
 * Send the report PDF to Claude and return the QFT values it reads off the page.
 *
 * Classification is intentionally not asked for — see `classifyQuantiferon`.
 */
export async function extractQftValuesFromPdf(
  pdfBytes: Uint8Array,
  options: { fileName?: string } = {}
): Promise<{ values: ExtractedQftValues; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new TbAnalysisConfigError('ANTHROPIC_API_KEY is not configured')
  }
  if (pdfBytes.byteLength > TB_ANALYSIS_MAX_PDF_BYTES) {
    throw new TbAnalysisExtractionError('Report is too large to analyze')
  }

  const client = new Anthropic({ apiKey })
  const model = defaultModel()
  const label = options.fileName ? ` (${options.fileName})` : ''

  // Text costs a fraction of what the same report costs as page images, so only fall back
  // to sending the PDF itself when there is no text layer to read.
  const textLayer = await readPdfTextLayer(pdfBytes)
  const content: Anthropic.Beta.BetaContentBlockParam[] = textLayer
    ? [{ type: 'text', text: `Report${label} text:\n\n${textLayer}` }]
    : [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: Buffer.from(pdfBytes).toString('base64'),
          },
        },
        { type: 'text', text: `Extract the QuantiFERON values from this report${label}.` },
      ]

  const response = await client.beta.messages.create({
    model,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: 'user', content }],
  })

  if (response.stop_reason === 'refusal') {
    throw new TbAnalysisExtractionError('The model declined to analyze this document')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new TbAnalysisExtractionError('The report was too complex to read in one pass')
  }

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()

  if (!text) {
    throw new TbAnalysisExtractionError('The model returned no result for this document')
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch {
    throw new TbAnalysisExtractionError('Could not read the values from this document')
  }

  const parsed = extractedValuesSchema.safeParse(parsedJson)
  if (!parsed.success) {
    throw new TbAnalysisExtractionError('Could not read the values from this document')
  }

  return { values: parsed.data, model: response.model ?? model }
}
