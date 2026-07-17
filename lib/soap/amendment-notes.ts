import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthorizationError, ValidationError } from '@/lib/api-error-handler'
import { isPhysicianRole } from '@/lib/roles'
import { getDoctorRowId } from '@/lib/clinical'
import { fetchProfileFields } from '@/lib/fetch-user-role'
import type { SoapNotePayload } from '@/lib/soap/encounter-doctor-soap'

const AMENDMENT_SELECT =
  'id, encounter_id, doctor_soapnote_id, doctor_id, subjective_text, objective_text, assessment_text, plan_text, amended_by, amended_by_name, amended_by_role, created_at'

export type AmendmentNoteRow = {
  id: number
  encounter_id: number
  doctor_soapnote_id: number
  doctor_id: number
  subjective_text: string | null
  objective_text: string | null
  assessment_text: string | null
  plan_text: string | null
  amended_by: string | null
  amended_by_name: string | null
  amended_by_role: string | null
  created_at: string
}

/** Original doctor SOAP is locked once completed — corrections go to amendments. */
export function canAmendEncounterSoap(
  status: string | null | undefined,
  role?: string | null
): boolean {
  return status === 'completed' && isPhysicianRole(role)
}

export async function loadAmendmentNotesForEncounter(
  admin: SupabaseClient,
  encounterId: number
): Promise<AmendmentNoteRow[]> {
  const { data, error } = await admin
    .from('amendment_notes')
    .select(AMENDMENT_SELECT)
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data as AmendmentNoteRow[] | null) ?? []
}

export async function createAmendmentNote(
  admin: SupabaseClient,
  args: {
    encounterId: number
    userId: string
    userEmail?: string | null
    role: string
    payload: SoapNotePayload
  }
): Promise<AmendmentNoteRow> {
  if (!isPhysicianRole(args.role)) {
    throw new AuthorizationError('Only doctors can add amendment notes')
  }

  const { data: encounter, error: encErr } = await admin
    .from('encounters')
    .select('id, status, doctor_id')
    .eq('id', args.encounterId)
    .maybeSingle()

  if (encErr) throw encErr
  if (!encounter) throw new ValidationError('Encounter not found')
  if (encounter.status !== 'completed') {
    throw new ValidationError('Amendment notes can only be added after the encounter is completed')
  }

  const selfDoctorId = await getDoctorRowId(admin, args.userId)
  if (selfDoctorId == null) {
    throw new AuthorizationError('Only doctors can add amendment notes')
  }

  // Prefer assigned encounter doctor; allow the signed-in physician when assigned.
  const encounterDoctorId =
    encounter.doctor_id != null && Number.isFinite(Number(encounter.doctor_id))
      ? Number(encounter.doctor_id)
      : null
  if (encounterDoctorId != null && encounterDoctorId !== selfDoctorId) {
    throw new AuthorizationError('Only the assigned doctor can amend this SOAP note')
  }

  const { data: doctorSoap, error: soapErr } = await admin
    .from('doctor_soapnotes')
    .select('id, encounter_id')
    .eq('encounter_id', args.encounterId)
    .maybeSingle()

  if (soapErr) throw soapErr
  if (!doctorSoap?.id) {
    throw new ValidationError('Save the original doctor SOAP note before adding amendments')
  }

  const profile = await fetchProfileFields(admin, args.userId, 'full_name, email', {
    email: args.userEmail,
  })
  const amendedByName =
    (typeof profile?.full_name === 'string' && profile.full_name.trim()) ||
    (typeof profile?.email === 'string' && profile.email) ||
    args.userEmail ||
    'Unknown'

  const { data: saved, error: insertErr } = await admin
    .from('amendment_notes')
    .insert({
      encounter_id: args.encounterId,
      doctor_soapnote_id: Number(doctorSoap.id),
      doctor_id: selfDoctorId,
      subjective_text: args.payload.subjective_text.trim(),
      objective_text: args.payload.objective_text.trim(),
      assessment_text: args.payload.assessment_text.trim(),
      plan_text: args.payload.plan_text.trim(),
      amended_by: args.userId,
      amended_by_name: amendedByName,
      amended_by_role: args.role,
    })
    .select(AMENDMENT_SELECT)
    .single()

  if (insertErr) throw insertErr
  return saved as AmendmentNoteRow
}
