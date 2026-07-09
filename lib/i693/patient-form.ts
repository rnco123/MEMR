import type { SupabaseClient } from '@supabase/supabase-js'

export type I693SubmissionRow = {
  id: number
  encounter_id: number
  patient_id: number
  form_data: unknown
  status: string
  ai_filled_at?: string | null
  ai_model?: string | null
  reviewed_at?: string | null
  reviewed_by_uid?: string | null
  pdf_storage_path?: string | null
  annotations?: unknown
  created_at?: string
  updated_at?: string
}

const SUBMISSION_SELECT =
  'id, encounter_id, patient_id, form_data, status, ai_filled_at, ai_model, reviewed_at, reviewed_by_uid, pdf_storage_path, annotations, created_at, updated_at'

/** Canonical I-693 submission for a patient (at most one row per patient). */
export async function findPatientI693Submission(
  admin: SupabaseClient,
  patientId: number
): Promise<I693SubmissionRow | null> {
  const { data, error } = await admin
    .from('i693_submissions')
    .select(SUBMISSION_SELECT)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as I693SubmissionRow | null) ?? null
}

export type ResolvedPatientI693 = {
  submission: I693SubmissionRow | null
  /** Encounter where the form was first created (when a submission exists). */
  formOwnerEncounterId: number | null
}

/** Resolve the patient's single I-693 form when opened from any immigration encounter. */
export async function resolvePatientI693ForEncounter(
  admin: SupabaseClient,
  patientId: number
): Promise<ResolvedPatientI693> {
  const submission = await findPatientI693Submission(admin, patientId)
  return {
    submission,
    formOwnerEncounterId: submission?.encounter_id ?? null,
  }
}
