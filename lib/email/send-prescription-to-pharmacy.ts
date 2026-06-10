import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { buildPrescriptionPharmacyEmail } from '@/lib/email/prescription-pharmacy-email'
import { sendEmail } from '@/lib/email/resend-client'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  loadEncounterForRx,
  normalizePrescriptionRow,
  PRESCRIPTION_SELECT_FULL,
  PRESCRIPTION_SELECT_LEGACY,
} from '@/lib/prescriptions/encounter-prescriptions'
import { logPharmacyEmailSent } from '@/lib/email/pharm-email-log'
import { resolvePharmEmailDoctorAndClinic } from '@/lib/email/resolve-pharm-email-context'
import { sanitizeEmail } from '@/lib/sanitize'

function formatPatientName(row: { first_name?: string | null; last_name?: string | null }): string {
  return [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'Patient'
}

export async function sendPrescriptionsToPharmacyEmail(input: {
  supabase: SupabaseClient
  encounterId: number
  prescriptionIds: number[]
  senderEmail?: string | null
  sentByUserId?: string | null
}): Promise<{
  messageId: string
  pharmacyEmail: string
  prescriptionCount: number
  pharmacyId: number
  sentAt: string
  doctorName: string | null
  clinicName: string | null
}> {
  const uniqueIds = [...new Set(input.prescriptionIds)].filter((id) => Number.isFinite(id) && id > 0)
  if (uniqueIds.length === 0) {
    throw new ValidationError('At least one prescription id is required')
  }

  const encounter = await loadEncounterForRx(input.supabase, input.encounterId)
  if (!encounter.pharmacy_id) {
    throw new ValidationError('Assign a pharmacy to this encounter before sending prescriptions')
  }

  const admin = createAdminClient()

  const { data: pharmacy, error: pharmacyError } = await admin
    .from('pharmacy')
    .select('id, name, email')
    .eq('id', encounter.pharmacy_id)
    .maybeSingle()

  if (pharmacyError) throw pharmacyError
  if (!pharmacy) throw new ValidationError('Pharmacy not found')

  const pharmacyEmail = sanitizeEmail((pharmacy.email as string | null) ?? '')
  if (!pharmacyEmail) {
    throw new ValidationError('This pharmacy has no email address on file')
  }

  const fullRxQuery = await admin
    .from('prescriptions')
    .select(PRESCRIPTION_SELECT_FULL)
    .eq('encounter_id', input.encounterId)
    .in('id', uniqueIds)
    .neq('status', 'cancelled')

  const rxQuery =
    fullRxQuery.error?.code === '42703'
      ? await admin
          .from('prescriptions')
          .select(PRESCRIPTION_SELECT_LEGACY)
          .eq('encounter_id', input.encounterId)
          .in('id', uniqueIds)
          .neq('status', 'cancelled')
      : fullRxQuery

  if (rxQuery.error) throw rxQuery.error

  const prescriptions = (rxQuery.data ?? []).map((row) =>
    normalizePrescriptionRow(row as Record<string, unknown>)
  )

  if (prescriptions.length === 0) {
    throw new ValidationError('No matching prescriptions found for this encounter')
  }
  if (prescriptions.length !== uniqueIds.length) {
    throw new ValidationError('One or more prescriptions could not be found for this encounter')
  }

  const { data: patient, error: patientError } = await admin
    .from('patients')
    .select('first_name, last_name, date_of_birth')
    .eq('id', encounter.patient_id)
    .maybeSingle()

  if (patientError) throw patientError
  if (!patient) throw new ValidationError('Patient not found')

  const { data: encounterMeta } = await admin
    .from('encounters')
    .select('appointment_id')
    .eq('id', input.encounterId)
    .maybeSingle()

  const { doctor, clinic } = await resolvePharmEmailDoctorAndClinic(admin, {
    encounterId: input.encounterId,
    patientId: encounter.patient_id,
    doctorId: encounter.doctor_id,
    appointmentId: (encounterMeta?.appointment_id as number | null) ?? null,
  })

  const emailContent = buildPrescriptionPharmacyEmail({
    encounterId: input.encounterId,
    patientName: formatPatientName(patient),
    patientDob: (patient.date_of_birth as string | null) ?? null,
    doctor,
    clinic,
    pharmacyName: (pharmacy.name as string | null) ?? null,
    prescriptions,
  })

  const result = await sendEmail({
    to: pharmacyEmail,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    replyTo: input.senderEmail?.trim() || undefined,
  })

  const pharmacyId = Number(encounter.pharmacy_id)
  const logRow = await logPharmacyEmailSent({
    encounterId: input.encounterId,
    pharmacyId,
    sentBy: input.sentByUserId,
    doctor,
    clinic,
  })

  return {
    messageId: result.id,
    pharmacyEmail,
    prescriptionCount: prescriptions.length,
    pharmacyId,
    sentAt: logRow.sent_at,
    doctorName: doctor.name,
    clinicName: clinic.name,
  }
}
