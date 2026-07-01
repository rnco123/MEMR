import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { isPhysicianRole, CLINICAL_STAFF_ROLE_VALUES, CLINICAL_STAFF_WITH_ADMIN_ROLE_VALUES } from '@/lib/roles'
import { getDoctorRowId } from '@/lib/clinical'
import { fetchProfileFields } from '@/lib/fetch-user-role'
import { cleanSoapSection } from '@/lib/soap/clean-soap-section'

export type SoapNotePayload = {
  subjective_text: string
  objective_text: string
  assessment_text: string
  plan_text: string
}

export type SoapAuditSummary = {
  editor_name: string | null
  editor_role: string | null
  action: 'create' | 'update'
  source: 'ai_seed' | 'doctor_soap' | 'manual'
  created_at: string
} | null

const SOAP_EDITABLE_UNTIL = 'completed'
const SOAP_EDITOR_ROLES = new Set<string>(CLINICAL_STAFF_ROLE_VALUES)

/**
 * SOAP edit rules:
 * - Before completed: doctor, nurse, and staff may edit.
 * - After completed: only the doctor may edit.
 */
export function canEditEncounterSoap(
  status: string | null | undefined,
  role?: string | null
): boolean {
  if (!status) return false
  if (status === SOAP_EDITABLE_UNTIL) {
    return isPhysicianRole(role)
  }
  return true
}

export function canEditSoapByRole(role: string | null | undefined): boolean {
  return Boolean(role && SOAP_EDITOR_ROLES.has(role))
}

const SOAP_VIEWER_ROLES = new Set<string>(CLINICAL_STAFF_WITH_ADMIN_ROLE_VALUES)

export function assertSoapViewerRole(role: string | null | undefined): void {
  if (!role || !SOAP_VIEWER_ROLES.has(role)) {
    throw new ValidationError('Doctors and nurses only')
  }
}

export function assertClinicalSoapRole(role: string | null | undefined): void {
  if (!canEditSoapByRole(role)) {
    throw new ValidationError('Doctors and nurses only')
  }
}

export async function resolveEncounterDoctorId(
  admin: SupabaseClient,
  encounterDoctorId: number | null,
  userId: string
): Promise<number> {
  if (encounterDoctorId != null && Number.isFinite(Number(encounterDoctorId))) {
    return Number(encounterDoctorId)
  }

  const selfDoctorId = await getDoctorRowId(admin, userId)
  if (selfDoctorId != null) return selfDoctorId

  throw new ValidationError('Assign a doctor to this encounter before saving SOAP notes')
}

export async function loadEncounterSoapContext(
  admin: SupabaseClient,
  encounterId: number,
  appointmentId?: number | null,
  role?: string | null
) {
  const { data: encounter, error: encErr } = await admin
    .from('encounters')
    .select('id, doctor_id, status, appointment_id')
    .eq('id', encounterId)
    .maybeSingle()

  if (encErr) throw encErr
  if (!encounter) throw new ValidationError('Encounter not found')

  const apptId = appointmentId ?? encounter.appointment_id

  let aiSoap: Record<string, unknown> | null = null
  const { data: aiByEncounter, error: aiEncErr } = await admin
    .from('ai_soapnotes')
    .select('id, subjective_text, objective_text, assessment_text, plan_text, created_at, updated_at')
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!aiEncErr && aiByEncounter) {
    aiSoap = aiByEncounter as Record<string, unknown>
  } else if (apptId) {
    const { data: aiByAppt } = await admin
      .from('ai_soapnotes')
      .select('id, subjective_text, objective_text, assessment_text, plan_text, created_at, updated_at')
      .eq('appointment_id', apptId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    aiSoap = (aiByAppt as Record<string, unknown> | null) ?? null
  }

  const { data: doctorSoap, error: docErr } = await admin
    .from('doctor_soapnotes')
    .select('id, doctor_id, subjective_text, objective_text, assessment_text, plan_text, created_at, updated_at')
    .eq('encounter_id', encounterId)
    .maybeSingle()

  if (docErr) throw docErr

  const { data: lastAudit, error: auditErr } = await admin
    .from('soap_audit')
    .select('editor_name, editor_role, action, source, created_at')
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (auditErr) throw auditErr

  return {
    encounter,
    ai_soap: aiSoap,
    doctor_soap: doctorSoap,
    last_audit: (lastAudit as SoapAuditSummary) ?? null,
    editable: canEditSoapByRole(role) && canEditEncounterSoap(encounter.status as string, role),
  }
}

export function normalizeAiSoapForSeed(aiSoap: Record<string, unknown> | null): SoapNotePayload {
  return {
    subjective_text: cleanSoapSection(String(aiSoap?.subjective_text ?? ''), 'subjective'),
    objective_text: cleanSoapSection(String(aiSoap?.objective_text ?? ''), 'objective'),
    assessment_text: cleanSoapSection(String(aiSoap?.assessment_text ?? ''), 'assessment'),
    plan_text: cleanSoapSection(String(aiSoap?.plan_text ?? ''), 'plan'),
  }
}

export async function saveDoctorSoapNote(
  admin: SupabaseClient,
  args: {
    encounterId: number
    userId: string
    userEmail?: string | null
    role: string
    payload: SoapNotePayload
    seededFromAi: boolean
  }
) {
  const ctx = await loadEncounterSoapContext(admin, args.encounterId, undefined, args.role)
  if (!canEditEncounterSoap(ctx.encounter.status as string, args.role)) {
    throw new ValidationError('SOAP notes cannot be changed after the encounter is completed')
  }

  const doctorId = await resolveEncounterDoctorId(admin, ctx.encounter.doctor_id as number | null, args.userId)
  const profile = await fetchProfileFields(admin, args.userId, 'full_name, email', {
    email: args.userEmail,
  })
  const editorName =
    (typeof profile?.full_name === 'string' && profile.full_name.trim()) ||
    (typeof profile?.email === 'string' && profile.email) ||
    args.userEmail ||
    'Unknown'

  const row = {
    encounter_id: args.encounterId,
    doctor_id: doctorId,
    subjective_text: args.payload.subjective_text.trim(),
    objective_text: args.payload.objective_text.trim(),
    assessment_text: args.payload.assessment_text.trim(),
    plan_text: args.payload.plan_text.trim(),
    updated_at: new Date().toISOString(),
  }

  const existing = ctx.doctor_soap as { id?: number } | null
  const action = existing?.id ? 'update' : 'create'
  const source = existing?.id ? 'doctor_soap' : args.seededFromAi ? 'ai_seed' : 'manual'

  const { data: saved, error: saveErr } = await admin
    .from('doctor_soapnotes')
    .upsert(row, { onConflict: 'encounter_id' })
    .select('id, doctor_id, subjective_text, objective_text, assessment_text, plan_text, created_at, updated_at')
    .single()

  if (saveErr) throw saveErr

  const { error: auditErr } = await admin.from('soap_audit').insert({
    encounter_id: args.encounterId,
    doctor_soapnote_id: saved.id,
    action,
    source,
    edited_by: args.userId,
    editor_role: args.role,
    editor_name: editorName,
    subjective_text: row.subjective_text,
    objective_text: row.objective_text,
    assessment_text: row.assessment_text,
    plan_text: row.plan_text,
  })

  if (auditErr) throw auditErr

  return {
    doctor_soap: saved,
    last_audit: {
      editor_name: editorName,
      editor_role: args.role,
      action,
      source,
      created_at: new Date().toISOString(),
    } satisfies NonNullable<SoapAuditSummary>,
  }
}
