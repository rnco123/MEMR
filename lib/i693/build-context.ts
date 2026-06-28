import type { SupabaseClient } from '@supabase/supabase-js'
import {
  formatIntakeForRisk,
  formatSoapForRisk,
  formatVitalsForRisk,
} from '@/lib/risk-alerts/build-clinical-context'
import { loadEncounterPhysicalExamination } from '@/lib/encounter/physical-examination-store'
import { formatPhysicalExaminationForContext } from '@/lib/encounter/physical-examination'
import { parseAddressComponents } from '@/lib/i693/ai-fill'
import {
  DOCTOR_SOAP_SELECT,
  PATIENT_DETAIL_SELECT,
} from '@/lib/encounters/encounter-detail-selects'
import { loadAiSoapRiskContextForEncounter } from '@/lib/encounters/load-ai-soap-for-encounter'
import { loadIntakeForEncounter } from '@/lib/encounters/load-intake-for-encounter'
import { loadLatestVitalsForEncounter } from '@/lib/vitals/load-encounter-vitals'

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

  const { data: patient } = await admin
    .from('patients')
    .select(PATIENT_DETAIL_SELECT)
    .eq('id', patientId)
    .maybeSingle()

  const appointmentId =
    enc?.appointment_id != null && Number.isFinite(Number(enc.appointment_id))
      ? Number(enc.appointment_id)
      : null
  const intakeId =
    enc?.intake_id != null && Number.isFinite(Number(enc.intake_id)) ? Number(enc.intake_id) : null

  const intake = await loadIntakeForEncounter(admin, intakeId, appointmentId)
  const vitalsRow = await loadLatestVitalsForEncounter(admin, encounterId)
  const aiSoap = await loadAiSoapRiskContextForEncounter(admin, encounterId, appointmentId)

  const { data: doctorSoap } = await admin
    .from('doctor_soapnotes')
    .select(DOCTOR_SOAP_SELECT)
    .eq('encounter_id', encounterId)
    .maybeSingle()

  const patientBlock = patient
    ? (() => {
        const addrRaw = String(patient.street_address ?? '').trim()
        const knownState = String(patient.state ?? '').trim()
        const knownZip = String(patient.zip_code ?? '').trim()
        const addr = addrRaw
          ? parseAddressComponents(addrRaw, knownState, knownZip)
          : { street: '', apt: '', city: '', state: knownState, zip: knownZip, country: '' }
        const addrLines = [
          addr.street && `  Street: ${addr.street}`,
          addr.apt && `  Apt/Ste/Flr: ${addr.apt}`,
          addr.city && `  City: ${addr.city}`,
          addr.state && `  State: ${addr.state}`,
          addr.zip && `  ZIP: ${addr.zip}`,
          addr.country && `  Country: ${addr.country}`,
        ].filter(Boolean).join('\n')
        return [
          `Patient: ${patient.first_name} ${patient.last_name}`,
          `DOB: ${patient.date_of_birth ?? 'unknown'}`,
          `Gender: ${patient.gender ?? 'unknown'}`,
          `Phone: ${patient.phone ?? ''}`,
          `Email: ${patient.email ?? ''}`,
          addrLines ? `Address (parsed):\n${addrLines}` : '',
          `Patient code: ${patient.patient_code ?? ''}`,
        ].filter(Boolean).join('\n')
      })()
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

  const physicalExamBundle = await loadEncounterPhysicalExamination(admin, encounterId, {
    legacyFindings: enc?.ma_exam_findings as string | null | undefined,
  })
  const physicalExamText = formatPhysicalExaminationForContext(physicalExamBundle.physical_examination)

  const maFindings =
    physicalExamText ||
    (enc?.ma_exam_findings && String(enc.ma_exam_findings).trim()
      ? String(enc.ma_exam_findings).trim()
      : null)

  const textBlock = [
    patientBlock && `PATIENT RECORD:\n${patientBlock}`,
    intakeText && `INTAKE:\n${intakeText}`,
    vitalsText,
    maFindings && `PHYSICAL EXAMINATION:\n${maFindings}`,
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
