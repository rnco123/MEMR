import { mergeI693Form } from '@/lib/i693/types'
import {
  I693TextractDocumentError,
  extractTextFromI693SupportingPdf,
  textractBlocksToText,
} from '@/lib/i693/supporting-documents/textract'
import {
  I693_SUPPORTING_DOCS_TOOL_NAME,
  generateI693DraftFromSupportingDocuments,
} from '@/lib/i693/supporting-documents/ai-draft'
import { normalizeAiGeneratedI693Draft } from '@/lib/i693/supporting-documents/schema'
import { mergeAcceptedI693AiDraft } from '@/lib/i693/supporting-documents/merge-draft'
import { saveI693SupportingPdfsToPatientDocuments } from '@/lib/i693/supporting-documents/patient-documents'

describe('I-693 supporting document AI flow', () => {
  test('orders Textract LINE blocks by page and position', () => {
    const result = textractBlocksToText([
      {
        BlockType: 'LINE',
        Text: 'Second line',
        Page: 1,
        Confidence: 90,
        Geometry: { BoundingBox: { Top: 0.3, Left: 0.1 } },
      },
      {
        BlockType: 'WORD',
        Text: 'ignored',
        Page: 1,
      },
      {
        BlockType: 'LINE',
        Text: 'First line',
        Page: 1,
        Confidence: 100,
        Geometry: { BoundingBox: { Top: 0.1, Left: 0.1 } },
      },
      {
        BlockType: 'LINE',
        Text: 'Second page',
        Page: 2,
        Confidence: 80,
        Geometry: { BoundingBox: { Top: 0.05, Left: 0.1 } },
      },
    ] as any)

    expect(result.text).toBe('First line\nSecond line\nSecond page')
    expect(result.lineCount).toBe(3)
    expect(result.averageConfidence).toBeCloseTo(90)
  })

  test('maps Textract unsupported document errors to I-693 OCR validation errors', async () => {
    const unsupported = new Error('Request has unsupported document format') as Error & {
      name: string
      __type: string
    }
    unsupported.name = 'UnsupportedDocumentException'
    unsupported.__type = 'UnsupportedDocumentException'

    const client = {
      send: jest.fn().mockRejectedValue(unsupported),
    }
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const file = {
      name: 'scan.png',
      size: imageBytes.byteLength,
      type: 'image/png',
      arrayBuffer: jest.fn().mockResolvedValue(imageBytes.buffer),
    } as any as File

    await expect(extractTextFromI693SupportingPdf(file, client)).rejects.toMatchObject({
      name: 'I693TextractDocumentError',
      message: expect.stringContaining('not supported by Textract OCR'),
    })
    await expect(extractTextFromI693SupportingPdf(file, client)).rejects.toBeInstanceOf(
      I693TextractDocumentError
    )
  })

  test('stores selected supporting PDFs in patient documents', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null })
    const remove = jest.fn().mockResolvedValue({ error: null })
    const insert = jest.fn((row) => ({
      select: jest.fn(() => ({
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'doc-1',
            file_name: row.file_name,
            file_path: row.file_path,
            file_size: row.file_size,
            file_type: row.file_type,
            document_category: row.document_category,
          },
          error: null,
        }),
      })),
    }))
    const admin = {
      storage: {
        from: jest.fn(() => ({ upload, remove })),
      },
      from: jest.fn(() => ({ insert })),
    } as any
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'vaccine.pdf', {
      type: 'application/pdf',
    })

    const docs = await saveI693SupportingPdfsToPatientDocuments(
      admin,
      52,
      77,
      [file],
      'user-1'
    )

    expect(upload).toHaveBeenCalledWith(
      expect.stringContaining('patient-52/immigration/i693-supporting/77/'),
      file,
      expect.objectContaining({ contentType: 'application/pdf', upsert: false })
    )
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: 52,
        document_category: 'i693',
        file_name: 'I-693 supporting - vaccine.pdf',
        file_size: file.size,
        file_type: 'application/pdf',
        uploaded_by: 'user-1',
      })
    )
    expect(docs[0]).toMatchObject({
      id: 'doc-1',
      file_name: 'I-693 supporting - vaccine.pdf',
      document_category: 'i693',
    })
  })

  test('normalizes AI draft output and removes values without evidence', () => {
    const draft = normalizeAiGeneratedI693Draft({
      form_data: {
        applicant: {
          family_name: 'LOPEZ',
          given_name: 'Adrian',
        },
        tb_screening: {
          classification: 'unknown',
        },
      },
      evidence: [
        {
          field: 'applicant.family_name',
          value: 'LOPEZ',
          source_document: 'result.pdf',
          source_quote: 'Patient: LOPEZ, ADRIAN',
        },
      ],
      warnings: ['Given name omitted because OCR did not clearly label it.'],
    })

    expect(draft.form.applicant.family_name).toBe('LOPEZ')
    expect(draft.form.applicant.given_name).toBe('')
    expect(draft.form.tb_screening.classification).toBe('')
    expect(draft.filledFields).toContain('applicant.family_name')
    expect(draft.warnings).toHaveLength(1)
  })

  test('parses the forced AI SDK tool call into a review draft', async () => {
    const generator = jest.fn(async (options: Record<string, unknown>) => {
      expect(options.toolChoice).toEqual({
        type: 'tool',
        toolName: I693_SUPPORTING_DOCS_TOOL_NAME,
      })
      expect(String(options.prompt)).toContain('Family Name: MOYEDA')
      expect(options.tools).toBeTruthy()

      return {
        finishReason: 'tool-calls',
        usage: { totalTokens: 123 },
        toolCalls: [
          {
            toolName: I693_SUPPORTING_DOCS_TOOL_NAME,
            input: {
              form_data: {
                applicant: {
                  family_name: 'MOYEDA',
                },
              },
              evidence: [
                {
                  field: 'applicant.family_name',
                  value: 'MOYEDA',
                  source_document: 'david vaccine.pdf',
                  source_quote: 'Family Name: MOYEDA',
                },
              ],
              warnings: [],
            },
          },
        ],
      }
    })

    const result = await generateI693DraftFromSupportingDocuments(
      {
        currentForm: mergeI693Form(undefined),
        documents: [
          {
            fileName: 'david vaccine.pdf',
            text: 'Family Name: MOYEDA',
            pages: 1,
            lineCount: 1,
            averageConfidence: 98,
          },
        ],
      },
      { generator, model: 'test-model', systemPrompt: 'system' }
    )

    expect(result.form.applicant.family_name).toBe('MOYEDA')
    expect(result.model).toBe('test-model')
    expect(result.filledFields).toEqual(['applicant.family_name'])
  })

  test('accept merge overlays generated values without erasing existing editor values', () => {
    const current = mergeI693Form({
      applicant: {
        given_name: 'Adrian',
        family_name: 'Draft',
      },
      vaccination_grid: [
        {
          vaccineCode: 'mmr',
          dateReceived: '2024-01-01',
        },
      ],
    } as any)
    const draft = mergeI693Form({
      applicant: {
        family_name: 'LOPEZ',
        given_name: '',
      },
      vaccination_grid: [
        {
          vaccineCode: 'mmr',
          immune: true,
        },
      ],
    } as any)

    const merged = mergeAcceptedI693AiDraft(current, draft)

    expect(merged.applicant.family_name).toBe('LOPEZ')
    expect(merged.applicant.given_name).toBe('Adrian')
    expect(merged.vaccination_grid.find((row) => row.vaccineCode === 'mmr')).toMatchObject({
      dateReceived: '2024-01-01',
      immune: true,
    })
  })
})
