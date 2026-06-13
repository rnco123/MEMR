import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { fetchProfileFields } from '@/lib/fetch-user-role'
import {
  canEditEncounterSoap,
  canEditSoapByRole,
} from '@/lib/soap/encounter-doctor-soap'

export type PatientInfoUpdatePayload = {
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  gender: string | null
  date_of_birth: string | null
  street_address: string | null
  state: string | null
  zip_code: string | null
}

export type EncounterPatientInfo = PatientInfoUpdatePayload & {
  id: number
  patient_code: string | null
}

export type PatientInfoAuditSummary = {
  editor_name: string | null
  editor_role: string | null
  action: 'update'
  created_at: string
} | null

export const PATIENT_INFO_SELECT =
  'id, first_name, last_name, email, phone, gender, date_of_birth, street_address, state, zip_code, patient_code'

const PATIENT_INFO_VIEWER_ROLES = new Set(['doctor', 'nurse', 'staff', 'admin'])

export function canEditPatientInfoByRole(role: string | null | undefined): boolean {
  return canEditSoapByRole(role)
}

export function canEditEncounterPatientInfo(status: string | null | undefined): boolean {
  return canEditEncounterSoap(status)
}

export function assertPatientInfoViewerRole(role: string | null | undefined): void {
  if (!role || !PATIENT_INFO_VIEWER_ROLES.has(role)) {
    throw new ValidationError('Doctors and nurses only')
  }
}

export function assertClinicalPatientInfoRole(role: string | null | undefined): void {
  if (!canEditPatientInfoByRole(role)) {
    throw new ValidationError('Doctors and nurses only')
  }
}

function normalizeNullable(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed || null
}

export function normalizePatientRow(row: Record<string, unknown>): EncounterPatientInfo {
  return {
    id: Number(row.id),
    first_name: String(row.first_name ?? '').trim(),
    last_name: String(row.last_name ?? '').trim(),
    email: normalizeNullable(row.email as string | null),
    phone: normalizeNullable(row.phone as string | null),
    gender: normalizeNullable(row.gender as string | null),
    date_of_birth: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : null,
    street_address: normalizeNullable(row.street_address as string | null),
    state: normalizeNullable(row.state as string | null),
    zip_code: normalizeNullable(row.zip_code as string | null),
    patient_code: normalizeNullable(row.patient_code as string | null),
  }
}

/** Schema path: encounter → appointment → patients (appointments.patient_id). */
export async function loadPatientForEncounterViaAppointment(
  admin: SupabaseClient,
  encounterId: number
): Promise<{
  patient: EncounterPatientInfo
  appointmentId: number
  encounterStatus: string
}> {
  const { data: encounter, error: encErr } = await admin
    .from('encounters')
    .select('id, appointment_id, status')
    .eq('id', encounterId)
    .maybeSingle()

  if (encErr) throw encErr
  if (!encounter) throw new ValidationError('Encounter not found')

  const appointmentId = Number(encounter.appointment_id)
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    throw new ValidationError('Encounter has no linked appointment')
  }

  const { data: appointment, error: apptErr } = await admin
    .from('appointments')
    .select(`patient_id, patients:patient_id (${PATIENT_INFO_SELECT})`)
    .eq('id', appointmentId)
    .maybeSingle()

  if (apptErr) throw apptErr
  if (!appointment) throw new ValidationError('Appointment not found')

  const patientId = Number(appointment.patient_id)
  if (!Number.isFinite(patientId) || patientId <= 0) {
    throw new ValidationError('Appointment has no linked patient')
  }

  const embedded = appointment.patients
  const patientRow =
    embedded && typeof embedded === 'object' && !Array.isArray(embedded)
      ? (embedded as Record<string, unknown>)
      : null

  let patient: EncounterPatientInfo | null = patientRow ? normalizePatientRow(patientRow) : null

  if (!patient) {
    const { data: patientData, error: patientErr } = await admin
      .from('patients')
      .select(PATIENT_INFO_SELECT)
      .eq('id', patientId)
      .maybeSingle()

    if (patientErr) throw patientErr
    if (!patientData) throw new ValidationError('Patient not found')
    patient = normalizePatientRow(patientData as Record<string, unknown>)
  }

  return {
    patient,
    appointmentId,
    encounterStatus: String(encounter.status ?? ''),
  }
}

export async function loadEncounterPatientInfoContext(admin: SupabaseClient, encounterId: number) {
  const { patient, encounterStatus } = await loadPatientForEncounterViaAppointment(admin, encounterId)

  const { data: lastAudit, error: auditErr } = await admin
    .from('patient_info_audit')
    .select('editor_name, editor_role, action, created_at')
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (auditErr) throw auditErr

  return {
    patient,
    last_audit: (lastAudit as PatientInfoAuditSummary) ?? null,
    editable: canEditEncounterPatientInfo(encounterStatus),
  }
}

export async function saveEncounterPatientInfo(
  admin: SupabaseClient,
  args: {
    encounterId: number
    userId: string
    userEmail?: string | null
    role: string
    payload: PatientInfoUpdatePayload
  }
) {
  const ctx = await loadEncounterPatientInfoContext(admin, args.encounterId)
  if (!ctx.editable) {
    throw new ValidationError('Patient information cannot be changed after the encounter is completed')
  }

  const profile = await fetchProfileFields(admin, args.userId, 'full_name, email', {
    email: args.userEmail,
  })
  const editorName =
    (typeof profile?.full_name === 'string' && profile.full_name.trim()) ||
    (typeof profile?.email === 'string' && profile.email) ||
    args.userEmail ||
    'Unknown'

  // Persist to the canonical patients row linked from the encounter's appointment.
  const patientUpdate = {
    first_name: args.payload.first_name.trim(),
    last_name: args.payload.last_name.trim(),
    email: normalizeNullable(args.payload.email),
    phone: normalizeNullable(args.payload.phone),
    gender: normalizeNullable(args.payload.gender),
    date_of_birth: args.payload.date_of_birth?.trim() || null,
    street_address: normalizeNullable(args.payload.street_address),
    state: normalizeNullable(args.payload.state),
    zip_code: normalizeNullable(args.payload.zip_code),
  }

  const { data: saved, error: saveErr } = await admin
    .from('patients')
    .update(patientUpdate)
    .eq('id', ctx.patient.id)
    .select(PATIENT_INFO_SELECT)
    .single()

  if (saveErr) throw saveErr

  const { error: auditErr } = await admin.from('patient_info_audit').insert({
    encounter_id: args.encounterId,
    patient_id: ctx.patient.id,
    action: 'update',
    edited_by: args.userId,
    editor_role: args.role,
    editor_name: editorName,
    ...patientUpdate,
  })

  if (auditErr) throw auditErr

  return {
    patient: normalizePatientRow(saved as Record<string, unknown>),
    last_audit: {
      editor_name: editorName,
      editor_role: args.role,
      action: 'update' as const,
      created_at: new Date().toISOString(),
    },
  }
}
