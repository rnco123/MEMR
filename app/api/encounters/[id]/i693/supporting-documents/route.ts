import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { handleApiError, AuthenticationError, AuthorizationError, ValidationError } from '@/lib/api-error-handler'
import { isI693ApiRole } from '@/lib/immigration/api-auth'
import { mergeI693Form } from '@/lib/i693/types'
import type { I693FormData } from '@/lib/i693/types'
import { getI693EditorFields } from '@/lib/i693/get-editor-fields'
import {
  I693TextractConfigError,
  I693TextractDocumentError,
  assertI693TextractConfigured,
  extractTextFromI693SupportingPdfs,
} from '@/lib/i693/supporting-documents/textract'
import { generateI693DraftFromSupportingDocuments } from '@/lib/i693/supporting-documents/ai-draft'
import { saveI693SupportingPdfsToPatientDocuments } from '@/lib/i693/supporting-documents/patient-documents'
import {
  resolvePatientDocumentContentType,
  scanPatientDocumentContent,
  validatePatientDocumentUpload,
} from '@/lib/security/file-upload'

import { guardI693EncounterAccess } from '@/lib/encounters/guard'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_SUPPORTING_DOCUMENTS = 8

function isUploadFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === 'object' &&
    value != null &&
    'arrayBuffer' in value &&
    'name' in value &&
    'size' in value
  )
}

function supportingPdfFiles(formData: FormData): File[] {
  const entries = [
    ...formData.getAll('documents'),
    ...formData.getAll('files'),
    ...formData.getAll('file'),
  ]
  const seen = new Set<File>()
  const files: File[] = []
  for (const entry of entries) {
    if (!isUploadFile(entry) || seen.has(entry)) continue
    seen.add(entry)
    files.push(entry)
  }
  return files
}

async function validateSupportingPdf(file: File): Promise<void> {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.pdf')) {
    throw new ValidationError(`${file.name} is not a PDF`)
  }

  const uploadValidation = validatePatientDocumentUpload(file)
  if (!uploadValidation.valid) {
    throw new ValidationError(uploadValidation.error ?? 'Invalid supporting document upload')
  }

  const contentType = resolvePatientDocumentContentType(file)
  if (contentType !== 'application/pdf') {
    throw new ValidationError(`${file.name} must be an application/pdf file`)
  }

  const contentScan = await scanPatientDocumentContent(file)
  if (!contentScan.valid) {
    throw new ValidationError(contentScan.error ?? 'Invalid supporting document content')
  }
}

function parseCurrentForm(formData: FormData): I693FormData | null {
  const raw = formData.get('current_form')
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    return mergeI693Form(JSON.parse(raw) as Partial<I693FormData>)
  } catch {
    throw new ValidationError('Invalid current_form JSON')
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId)) throw new ValidationError('Invalid encounter id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isI693ApiRole(roleInfo?.role)) throw new AuthorizationError()

    const formData = await request.formData()
    const files = supportingPdfFiles(formData)
    if (files.length === 0) throw new ValidationError('Upload at least one supporting PDF')
    if (files.length > MAX_SUPPORTING_DOCUMENTS) {
      throw new ValidationError(`Upload up to ${MAX_SUPPORTING_DOCUMENTS} PDFs at a time`)
    }

    for (const file of files) {
      await validateSupportingPdf(file)
    }

    assertI693TextractConfigured()

    await guardI693EncounterAccess(user.id, encounterId)


    const admin = createAdminClient()
    const { data: enc, error: encErr } = await admin
      .from('encounters')
      .select('id, patient_id')
      .eq('id', encounterId)
      .maybeSingle()
    if (encErr) throw encErr
    if (!enc) throw new ValidationError('Encounter not found')
    const patientId = Number(enc.patient_id)
    if (!Number.isFinite(patientId)) throw new ValidationError('Encounter patient not found')

    const { data: existing } = await admin
      .from('i693_submissions')
      .select('form_data')
      .eq('encounter_id', encounterId)
      .maybeSingle()

    const currentForm =
      parseCurrentForm(formData) ??
      mergeI693Form((existing?.form_data as Partial<I693FormData>) ?? undefined)

    const patientDocuments = await saveI693SupportingPdfsToPatientDocuments(
      admin,
      patientId,
      encounterId,
      files,
      user.id
    )
    const documents = await extractTextFromI693SupportingPdfs(files)
    const editorFields = await getI693EditorFields().then((result) => result.fields).catch(() => [])
    const draft = await generateI693DraftFromSupportingDocuments({
      documents,
      currentForm,
      editorFields,
    })

    return NextResponse.json({
      success: true,
      form_data: draft.form,
      evidence: draft.evidence,
      warnings: draft.warnings,
      filled_fields: draft.filledFields,
      filled_count: draft.filledFields.length,
      model: draft.model,
      usage: draft.usage,
      finish_reason: draft.finishReason,
      documents: documents.map((doc) => ({
        file_name: doc.fileName,
        pages: doc.pages,
        line_count: doc.lineCount,
        average_confidence: doc.averageConfidence,
      })),
      patient_documents: patientDocuments,
    })
  } catch (e) {
    if (e instanceof I693TextractDocumentError || e instanceof I693TextractConfigError) {
      return handleApiError(new ValidationError(e.message))
    }
    return handleApiError(e)
  }
}
