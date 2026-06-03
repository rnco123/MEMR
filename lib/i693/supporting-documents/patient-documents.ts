import type { SupabaseClient } from '@supabase/supabase-js'
import {
  generateSecureFileName,
  resolvePatientDocumentContentType,
} from '@/lib/security/file-upload'

export type SavedI693SupportingDocument = {
  id: string | number
  file_name: string
  file_path: string
  file_size: number
  file_type: string
  document_category: string
}

export async function saveI693SupportingPdfsToPatientDocuments(
  admin: SupabaseClient,
  patientId: number,
  encounterId: number,
  files: File[],
  uploadedBy: string
): Promise<SavedI693SupportingDocument[]> {
  const saved: SavedI693SupportingDocument[] = []

  for (const file of files) {
    const contentType = resolvePatientDocumentContentType(file) ?? 'application/pdf'
    const fileName = generateSecureFileName(file.name)
    const filePath = `patient-${patientId}/immigration/i693-supporting/${encounterId}/${fileName}`
    const displayName = `I-693 supporting - ${file.name}`

    const { error: uploadError } = await admin.storage
      .from('patient-documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      })

    if (uploadError) throw uploadError

    const { data: document, error: insertError } = await admin
      .from('patient_documents')
      .insert({
        patient_id: patientId,
        document_category: 'i693',
        file_path: filePath,
        file_name: displayName,
        file_size: file.size,
        file_type: contentType,
        uploaded_by: uploadedBy,
      })
      .select('id, file_name, file_path, file_size, file_type, document_category')
      .single()

    if (insertError) {
      await admin.storage.from('patient-documents').remove([filePath])
      throw insertError
    }

    if (document) saved.push(document)
  }

  return saved
}
