import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import type { I693FormData } from '@/lib/i693/types'
import { I693_UI_SECTIONS } from '@/lib/i693/field-sections'
import type { PdfWidgetEditorField } from '@/lib/i693/extract-pdf-widgets'
import type { TextractDocumentText } from '@/lib/i693/supporting-documents/textract'
import {
  i693AiDraftToolInputSchema,
  normalizeAiGeneratedI693Draft,
  type NormalizedI693AiDraft,
} from '@/lib/i693/supporting-documents/schema'

export const I693_SUPPORTING_DOCS_TOOL_NAME = 'create_i693_pdf_form_editor_draft'

type AiTextGeneratorResult = {
  toolCalls?: Array<{ toolName: string; input: unknown; invalid?: boolean; error?: unknown }>
  text?: string
  usage?: unknown
  finishReason?: string
}

type AiTextGenerator = (options: Record<string, unknown>) => Promise<AiTextGeneratorResult>

export type GenerateI693DraftInput = {
  documents: TextractDocumentText[]
  currentForm: I693FormData
  editorFields?: PdfWidgetEditorField[]
}

export type GenerateI693DraftResult = NormalizedI693AiDraft & {
  model: string
  usage?: unknown
  finishReason?: string
}

const PROMPT_PATH = path.join(
  process.cwd(),
  'lib/i693/prompts/supporting-documents-i693.system.md'
)

async function readSystemPrompt(): Promise<string> {
  return readFile(PROMPT_PATH, 'utf8')
}

function formSchemaManifest(): string {
  const lines = I693_UI_SECTIONS.flatMap((section) => (
    section.fields.map((field) => `${field.key} (${field.label}; ${field.type})`)
  ))

  return [
    ...lines,
    'vaccinations[] (vaccine_name, date_given, waiver_reason, not_medically_appropriate)',
    'vaccination_grid[] (vaccineCode, dateGiven, dateReceived, datesReceived, completeSeries, contraindicated, insufficientInterval, notAgeAppropriate, immune, historyOfDisease)',
    'pdf_widget_values (raw full PDF field name to string; only when field manifest lists the field)',
  ].join('\n')
}

function editorFieldManifest(fields: PdfWidgetEditorField[] | undefined): string {
  if (!fields?.length) return 'No PDF editor field manifest was available.'

  return fields
    .map((field) => (
      `${field.key} | ${field.label} | page ${field.page + 1} | ${field.kind} | ${field.widgetName}`
    ))
    .join('\n')
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n[TRUNCATED ${text.length - maxChars} chars]`
}

function documentsForPrompt(documents: TextractDocumentText[]): string {
  const perDocumentBudget = Math.max(8000, Math.floor(110000 / Math.max(documents.length, 1)))
  return documents
    .map((doc, index) => [
      `DOCUMENT ${index + 1}: ${doc.fileName}`,
      `PAGES: ${doc.pages}`,
      `LINE_COUNT: ${doc.lineCount}`,
      `AVERAGE_CONFIDENCE: ${doc.averageConfidence == null ? 'unknown' : doc.averageConfidence.toFixed(2)}`,
      'OCR_TEXT:',
      truncate(doc.text, perDocumentBudget),
    ].join('\n'))
    .join('\n\n---\n\n')
}

export function buildI693SupportingDocumentsPrompt(input: GenerateI693DraftInput): string {
  return [
    'Create an evidence-bound I-693 PDF editor draft from these supporting documents.',
    '',
    'CURRENT_DRAFT_FOR_CONTEXT_ONLY:',
    truncate(JSON.stringify(input.currentForm, null, 2), 30000),
    '',
    'I693_FORM_DATA_FIELD_MANIFEST:',
    formSchemaManifest(),
    '',
    'PDF_EDITOR_FIELD_MANIFEST:',
    editorFieldManifest(input.editorFields),
    '',
    'SUPPORTING_DOCUMENT_OCR:',
    documentsForPrompt(input.documents),
  ].join('\n')
}

function defaultModelName(): string {
  return (
    process.env.OPENAI_I693_SUPPORTING_DOCS_MODEL?.trim() ||
    process.env.OPENAI_I693_MODEL?.trim() ||
    'gpt-4o-mini'
  )
}

function toolCallInputFromResult(result: AiTextGeneratorResult): unknown {
  const call = result.toolCalls?.find((item) => item.toolName === I693_SUPPORTING_DOCS_TOOL_NAME)
  if (!call) return null
  if (call.invalid) throw new Error(`OpenAI returned an invalid I-693 draft tool call: ${String(call.error ?? '')}`)
  return call.input
}

export async function generateI693DraftFromSupportingDocuments(
  input: GenerateI693DraftInput,
  options: {
    generator?: AiTextGenerator
    model?: string
    systemPrompt?: string
  } = {}
): Promise<GenerateI693DraftResult> {
  if (!input.documents.some((doc) => doc.text.trim())) {
    throw new Error('Textract did not return any text from the uploaded supporting documents')
  }

  if (!options.generator && !process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const modelName = options.model ?? defaultModelName()
  const system = options.systemPrompt ?? await readSystemPrompt()
  const prompt = buildI693SupportingDocumentsPrompt(input)
  const generator: AiTextGenerator = options.generator ?? ((settings) => (
    generateText(settings as Parameters<typeof generateText>[0]) as Promise<AiTextGeneratorResult>
  ))

  const result = await generator({
    model: openai(modelName),
    system,
    prompt,
    temperature: 0,
    maxOutputTokens: 12000,
    tools: {
      [I693_SUPPORTING_DOCS_TOOL_NAME]: {
        description:
          'Return the evidence-bound I-693 PDF form editor draft extracted from supporting documents.',
        inputSchema: i693AiDraftToolInputSchema,
        execute: async (input: unknown) => input,
      },
    },
    toolChoice: { type: 'tool', toolName: I693_SUPPORTING_DOCS_TOOL_NAME },
  })

  const toolInput = toolCallInputFromResult(result)
  if (!toolInput) {
    throw new Error('OpenAI did not return the I-693 draft tool call')
  }

  return {
    ...normalizeAiGeneratedI693Draft(toolInput),
    model: modelName,
    usage: result.usage,
    finishReason: result.finishReason,
  }
}
