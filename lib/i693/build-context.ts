import type { SupabaseClient } from '@supabase/supabase-js'
import {
  formatIntakeForRisk,
  formatSoapForRisk,
  formatVitalsForRisk,
} from '@/lib/risk-alerts/build-clinical-context'

export type I693ClinicalBundle = {
  patient: Record<string, unknown> | null
  intake: Record<string, unknown> | null
  vitals: Record<string, unknown> | null
  aiSoap: Record<string, unknown> | null
  doctorSoap: Record<string, unknown> | null
  encounter: Record<string, unknown> | null
  maFindings: string | null
  textBlock: string
}

export async function buildI693ClinicalContext(
  admin: SupabaseClient,
  encounterId: number,
  patientId: number
): Promise<I693ClinicalBundle> {
  const { data: enc } = await admin
    .from('encounters')
    .select(
      'id, appointment_id, patient_id, intake_id, ma_exam_findings, consent_ack, status, pharmacy_id'
    )
    .eq('id', encounterId)
    .maybeSingle()

  const { data: patient } = await admin.from('patients').select('*').eq('id', patientId).maybeSingle()

  let intake: Record<string, unknown> | null = null
  if (enc?.intake_id) {
    const { data } = await admin.from('intake_form').select('*').eq('id', enc.intake_id).maybeSingle()
    if (data) intake = data as Record<string, unknown>
  }
  if (!intake && enc?.appointment_id) {
    const { data } = await admin
      .from('intake_form')
      .select('*')
      .eq('appointment_id', enc.appointment_id)
      .maybeSingle()
    if (data) intake = data as Record<string, unknown>
  }

  const { data: vitalsRow } = await admin
    .from('vitals')
    .select('*')
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let aiSoap: Record<string, unknown> | null = null
  const { data: soapEnc } = await admin
    .from('ai_soapnotes')
    .select('subjective_text, objective_text, assessment_text, plan_text')
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (soapEnc) {
    aiSoap = soapEnc as Record<string, unknown>
  } else if (enc?.appointment_id) {
    const { data: soapAppt } = await admin
      .from('ai_soapnotes')
      .select('subjective_text, objective_text, assessment_text, plan_text')
      .eq('appointment_id', enc.appointment_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (soapAppt) aiSoap = soapAppt as Record<string, unknown>
  }

  const { data: doctorSoap } = await admin
    .from('doctor_soapnotes')
    .select('subjective_text, objective_text, assessment_text, plan_text')
    .eq('encounter_id', encounterId)
    .maybeSingle()

  const patientBlock = patient
    ? [
        `Patient: ${patient.first_name} ${patient.last_name}`,
        `DOB: ${patient.date_of_birth ?? 'unknown'}`,
        `Gender: ${patient.gender ?? 'unknown'}`,
        `Phone: ${patient.phone ?? ''}`,
        `Email: ${patient.email ?? ''}`,
        `Address: ${[patient.street_address, patient.state, patient.zip_code].filter(Boolean).join(', ')}`,
        `Patient code: ${patient.patient_code ?? ''}`,
      ].join('\n')
    : ''

  const intakeText = formatIntakeForRisk(intake)
  const vitalsText = formatVitalsForRisk((vitalsRow as Record<string, unknown>) || null)
  const aiSoapText = formatSoapForRisk(
    aiSoap as {
      subjective_text?: string | null
      objective_text?: string | null
      assessment_text?: string | null
      plan_text?: string | null
    } | null
  )
  const doctorSoapText = formatSoapForRisk(
    doctorSoap as {
      subjective_text?: string | null
      objective_text?: string | null
      assessment_text?: string | null
      plan_text?: string | null
    } | null
  )

  const maFindings =
    enc?.ma_exam_findings && String(enc.ma_exam_findings).trim()
      ? String(enc.ma_exam_findings).trim()
      : null

  const textBlock = [
    patientBlock && `PATIENT RECORD:\n${patientBlock}`,
    intakeText && `INTAKE:\n${intakeText}`,
    vitalsText,
    maFindings && `MA EXAM FINDINGS:\n${maFindings}`,
    aiSoapText && `AI SOAP:\n${aiSoapText}`,
    doctorSoapText && `DOCTOR SOAP:\n${doctorSoapText}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    patient: (patient as Record<string, unknown>) ?? null,
    intake,
    vitals: (vitalsRow as Record<string, unknown>) ?? null,
    aiSoap,
    doctorSoap: (doctorSoap as Record<string, unknown>) ?? null,
    encounter: (enc as Record<string, unknown>) ?? null,
    maFindings,
    textBlock,
  }
}
