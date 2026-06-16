import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { buildSoapPatientEmail } from '@/lib/email/soap-patient-email'
import { resolvePharmEmailDoctorAndClinic } from '@/lib/email/resolve-pharm-email-context'
import { sendEmail } from '@/lib/email/resend-client'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  loadEncounterSoapContext,
  normalizeAiSoapForSeed,
  type SoapNotePayload,
} from '@/lib/soap/encounter-doctor-soap'
import { sanitizeEmail } from '@/lib/sanitize'

const SOAP_EMAIL_FROM_NAME = 'MyclinicMD Soap Service'
const SOAP_EMAIL_FROM_EMAIL = 'emr@alerts.myclinicmd.com'

function formatPatientName(row: { first_name?: string | null; last_name?: string | null }): string {
  return [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'Patient'
}

function formatVisitDate(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function resolveSoapPayload(
  doctorSoap: Record<string, unknown> | null,
  aiSoap: Record<string, unknown> | null
): SoapNotePayload {
  if (doctorSoap) {
    return {
      subjective_text: String(doctorSoap.subjective_text ?? '').trim(),
      objective_text: String(doctorSoap.objective_text ?? '').trim(),
      assessment_text: String(doctorSoap.assessment_text ?? '').trim(),
      plan_text: String(doctorSoap.plan_text ?? '').trim(),
    }
  }
  if (aiSoap) return normalizeAiSoapForSeed(aiSoap)
  throw new ValidationError('No SOAP notes available to email')
}

export async function sendSoapNoteToPatient(input: {
  supabase: SupabaseClient
  encounterId: number
  senderEmail?: string | null
}): Promise<{
  messageId: string
  patientEmail: string
  sentAt: string
}> {
  const admin = createAdminClient()
  const ctx = await loadEncounterSoapContext(admin, input.encounterId)
  const soap = resolveSoapPayload(
    (ctx.doctor_soap as Record<string, unknown> | null) ?? null,
    (ctx.ai_soap as Record<string, unknown> | null) ?? null
  )

  const { data: encounterRow, error: encErr } = await admin
    .from('encounters')
    .select('id, patient_id, doctor_id, encounter_code, appointment_id')
    .eq('id', input.encounterId)
    .maybeSingle()

  if (encErr) throw encErr
  if (!encounterRow?.patient_id) throw new ValidationError('Encounter not found')

  const { data: patient, error: patientErr } = await admin
    .from('patients')
    .select('id, first_name, last_name, email')
    .eq('id', encounterRow.patient_id)
    .maybeSingle()

  if (patientErr) throw patientErr
  if (!patient) throw new ValidationError('Patient not found')

  const patientEmail = sanitizeEmail((patient.email as string | null) ?? '')
  if (!patientEmail) {
    throw new ValidationError('This patient has no email address on file')
  }

  let visitDate: string | null = null
  if (encounterRow.appointment_id) {
    const { data: appt } = await admin
      .from('appointments')
      .select('appointment_date')
      .eq('id', encounterRow.appointment_id)
      .maybeSingle()
    visitDate = formatVisitDate((appt?.appointment_date as string | null) ?? null)
  }

  const { doctor, clinic } = await resolvePharmEmailDoctorAndClinic(admin, {
    encounterId: input.encounterId,
    patientId: Number(encounterRow.patient_id),
    doctorId: encounterRow.doctor_id != null ? Number(encounterRow.doctor_id) : null,
    appointmentId: encounterRow.appointment_id != null ? Number(encounterRow.appointment_id) : null,
  })

  const { subject, html, text } = buildSoapPatientEmail({
    encounterId: input.encounterId,
    encounterCode: (encounterRow.encounter_code as string | null) ?? null,
    patientName: formatPatientName(patient),
    visitDate,
    doctor,
    clinic,
    soap,
  })

  const result = await sendEmail({
    to: patientEmail,
    subject,
    html,
    text,
    fromEmail: SOAP_EMAIL_FROM_EMAIL,
    fromName: SOAP_EMAIL_FROM_NAME,
    replyTo: input.senderEmail?.trim() || clinic.email?.trim() || undefined,
  })

  return {
    messageId: result.id,
    patientEmail,
    sentAt: new Date().toISOString(),
  }
}
