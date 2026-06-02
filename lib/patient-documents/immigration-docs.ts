import type { SupabaseClient } from '@supabase/supabase-js'
import { buildI693Href } from '@/lib/i693/paths'
import { IMMIGRATION_PROGRAM } from '@/lib/immigration/types'

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

  const { data: submissions } = await admin
    .from('i693_submissions')
    .select('id, encounter_id, patient_id, status, pdf_storage_path, created_at, updated_at')
    .eq('patient_id', patientId)
    .order('updated_at', { ascending: false })

  for (const sub of submissions ?? []) {
    const encounterId = sub.encounter_id
    // Exported PDFs are also stored in patient_documents — skip duplicate virtual row
    if (sub.pdf_storage_path) continue

    const fileUrl = `/api/patients/${patientId}/documents/i693/${encounterId}`

    docs.push({
      id: `i693-${encounterId}`,
      patient_id: patientId,
      document_name: `Form I-693 — Encounter #${encounterId}`,
      document_label: 'i693',
      file_url: fileUrl,
      file_name: `I-693-encounter-${encounterId}.pdf`,
      file_size: 0,
      file_type: 'application/pdf',
      uploaded_by: 'system',
      uploaded_by_name: 'Immigration workflow',
      created_at: sub.updated_at ?? sub.created_at,
      source: 'i693',
      encounter_id: encounterId,
      i693_status: sub.status,
      open_href: buildI693Href(i693Base, { encounterId, tab: 'pdf' }),
      is_system: true,
    })
  }

  const submissionEncounterIds = new Set((submissions ?? []).map((s) => s.encounter_id))

  const { data: immigrationEncounters } = await admin
    .from('encounters')
    .select('id, created_at, program_type')
    .eq('patient_id', patientId)
    .eq('program_type', IMMIGRATION_PROGRAM)
    .order('created_at', { ascending: false })

  for (const enc of immigrationEncounters ?? []) {
    if (submissionEncounterIds.has(enc.id)) continue
    docs.push({
      id: `immigration-${enc.id}`,
      patient_id: patientId,
      document_name: `Immigration medical exam — Encounter #${enc.id}`,
      document_label: 'immigration',
      file_url: '',
      file_name: '',
      file_size: 0,
      file_type: 'application/pdf',
      uploaded_by: 'system',
      uploaded_by_name: 'Immigration workflow',
      created_at: enc.created_at,
      source: 'immigration',
      encounter_id: enc.id,
      open_href: buildI693Href(i693Base, { encounterId: enc.id, tab: 'form' }),
      is_system: true,
    })
  }

  return docs
}
