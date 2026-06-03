import type { SupabaseClient } from '@supabase/supabase-js'
import type { I693Annotation } from '@/lib/i693/annotations'
import type { I693FormData } from '@/lib/i693/types'
import { generateI693PdfBytes } from '@/lib/i693/generate-pdf'
import { loadEncounterImmigrationContext } from '@/lib/i693/immigration-eligibility'

export type PersistI693PdfOptions = {
  /** Keep submission status (e.g. draft) when syncing on every form save. */
  preserveSubmissionStatus?: boolean
}

/** Store generated I-693 PDF in patient-documents bucket and link on submission row. */
export async function persistI693PdfToPatientFile(
  admin: SupabaseClient,
  patientId: number,
  encounterId: number,
  pdfBytes: Uint8Array,
  uploadedByUid?: string | null,
  options?: PersistI693PdfOptions
): Promise<string> {
  const filePath = `patient-${patientId}/immigration/I-693-encounter-${encounterId}.pdf`
  const fileName = `Form I-693 (Encounter ${encounterId})`

  const { error: uploadErr } = await admin.storage.from('patient-documents').upload(filePath, pdfBytes, {
    cacheControl: '3600',
    upsert: true,
    contentType: 'application/pdf',
  })
  if (uploadErr) {
    console.error('[i693] patient document upload:', uploadErr.message)
    throw uploadErr
  }

  const submissionPatch: Record<string, unknown> = {
    pdf_storage_path: filePath,
    updated_at: new Date().toISOString(),
  }
  if (!options?.preserveSubmissionStatus) {
    submissionPatch.status = 'exported'
  }

  await admin.from('i693_submissions').update(submissionPatch).eq('encounter_id', encounterId)

  const { data: existing } = await admin
    .from('patient_documents')
    .select('id')
    .eq('patient_id', patientId)
    .eq('file_path', filePath)
    .maybeSingle()

  const row = {
    patient_id: patientId,
    file_path: filePath,
    file_name: fileName,
    file_type: 'application/pdf',
    file_size: pdfBytes.byteLength,
    document_category: 'i693' as const,
    uploaded_by: uploadedByUid ?? null,
  }

  if (existing?.id) {
    await admin.from('patient_documents').update(row).eq('id', existing.id)
  } else {
    await admin.from('patient_documents').insert(row)
  }

  return filePath
}

/** Regenerate PDF from saved form data and store in patient file (immigration encounters only). */
export async function syncI693PdfToPatientFileAfterSave(
  admin: SupabaseClient,
  encounterId: number,
  patientId: number,
  formData: I693FormData,
  annotations: I693Annotation[],
  uploadedByUid?: string | null
): Promise<string | null> {
  const ctx = await loadEncounterImmigrationContext(admin, encounterId)
  if (!ctx?.isImmigration) return null

  const { bytes } = await generateI693PdfBytes(formData, annotations, { bakeAnnotations: true })
  return persistI693PdfToPatientFile(admin, patientId, encounterId, bytes, uploadedByUid, {
    preserveSubmissionStatus: true,
  })
}
