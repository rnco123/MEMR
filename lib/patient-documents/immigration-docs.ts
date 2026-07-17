import type { SupabaseClient } from '@supabase/supabase-js'
import { buildI693Href } from '@/lib/i693/paths'
import { isImmigrationEncounterForI693 } from '@/lib/i693/immigration-eligibility'
import { findPatientI693Submission } from '@/lib/i693/patient-form'

export type ImmigrationPatientDocument = {
  id: string
  patient_id: number
  document_name: string
  document_label: 'i693' | 'immigration'
  file_url: string
  file_name: string
  file_size: number
  file_type: string
  uploaded_by: string
  uploaded_by_name: string | null
  created_at: string
  source: 'i693' | 'immigration'
  encounter_id: number
  i693_status?: string | null
  open_href: string
  is_system: true
}

export async function listImmigrationDocumentsForPatient(
  admin: SupabaseClient,
  patientId: number,
  options?: { i693BasePath?: string }
): Promise<ImmigrationPatientDocument[]> {
  const i693Base = options?.i693BasePath ?? '/dashboard/i-693'
  const docs: ImmigrationPatientDocument[] = []

  const submission = await findPatientI693Submission(admin, patientId)

  if (submission) {
    const encounterId = submission.encounter_id
    // Exported PDFs normally have a patient_documents row. If that metadata write
    // failed, retain the generated API document so the form does not disappear.
    let hasStoredChartRow = false
    if (submission.pdf_storage_path) {
      const { data: storedRow, error: storedRowError } = await admin
        .from('patient_documents')
        .select('id')
        .eq('patient_id', patientId)
        .eq('file_path', submission.pdf_storage_path)
        .maybeSingle()
      if (storedRowError) {
        console.error('[immigration-docs] patient document lookup:', storedRowError.message)
      }
      hasStoredChartRow = Boolean(storedRow?.id)
    }

    if (!hasStoredChartRow) {
      const fileUrl = `/api/patients/${patientId}/documents/i693/${encounterId}`

      docs.push({
        id: `i693-${patientId}`,
        patient_id: patientId,
        document_name: 'Form I-693',
        document_label: 'i693',
        file_url: fileUrl,
        file_name: `I-693-patient-${patientId}.pdf`,
        file_size: 0,
        file_type: 'application/pdf',
        uploaded_by: 'system',
        uploaded_by_name: 'Immigration workflow',
        created_at: submission.updated_at ?? submission.created_at ?? new Date().toISOString(),
        source: 'i693',
        encounter_id: encounterId,
        i693_status: submission.status,
        open_href: buildI693Href(i693Base, { encounterId, tab: 'pdf' }),
        is_system: true,
      })
    }
    return docs
  }

  const { data: immigrationEncounters } = await admin
    .from('encounters')
    .select(
      `
      id,
      created_at,
      program_type,
      consent_ack,
      appointments:appointment_id ( services:service_id ( title_en, title_es ) )
    `
    )
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  const latestImmigration = (immigrationEncounters ?? []).find((enc) =>
    isImmigrationEncounterForI693(enc)
  )

  if (latestImmigration) {
    docs.push({
      id: `immigration-${latestImmigration.id}`,
      patient_id: patientId,
      document_name: 'Form I-693 (not started)',
      document_label: 'immigration',
      file_url: '',
      file_name: '',
      file_size: 0,
      file_type: 'application/pdf',
      uploaded_by: 'system',
      uploaded_by_name: 'Immigration workflow',
      created_at: latestImmigration.created_at,
      source: 'immigration',
      encounter_id: latestImmigration.id,
      open_href: buildI693Href(i693Base, { encounterId: latestImmigration.id, tab: 'form' }),
      is_system: true,
    })
  }

  return docs
}
