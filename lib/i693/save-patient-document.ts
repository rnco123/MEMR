import type { SupabaseClient } from '@supabase/supabase-js'

/** Store generated I-693 PDF in patient-documents bucket and link on submission row. */
export async function persistI693PdfToPatientFile(
  admin: SupabaseClient,
  patientId: number,
  encounterId: number,
  pdfBytes: Uint8Array,
  uploadedByUid?: string | null
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

  await admin
    .from('i693_submissions')
    .update({
      pdf_storage_path: filePath,
      status: 'exported',
      updated_at: new Date().toISOString(),
    })
    .eq('encounter_id', encounterId)

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
  } else if (uploadedByUid) {
    await admin.from('patient_documents').insert(row)
  }

  return filePath
}
