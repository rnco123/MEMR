import { createAdminClient } from '@/lib/supabase/admin'
import type { PharmEmailClinicInfo, PharmEmailDoctorInfo } from '@/lib/email/resolve-pharm-email-context'

export type PharmEmailLogRow = {
  id: number
  encounter_id: number
  pharmacy_id: number
  sent_at: string
  sent_by: string | null
  doctor_id: number | null
  doctor_name: string | null
  doctor_phone: string | null
  doctor_email: string | null
  clinic_location_id: number | null
  clinic_name: string | null
  clinic_address: string | null
  clinic_phone: string | null
  clinic_email: string | null
}

const LOG_SELECT =
  'id, encounter_id, pharmacy_id, sent_at, sent_by, doctor_id, doctor_name, doctor_phone, doctor_email, clinic_location_id, clinic_name, clinic_address, clinic_phone, clinic_email'

export async function logPharmacyEmailSent(input: {
  encounterId: number
  pharmacyId: number
  sentBy?: string | null
  doctor: PharmEmailDoctorInfo
  clinic: PharmEmailClinicInfo
}): Promise<PharmEmailLogRow> {
  const admin = createAdminClient()

  const fullRow = {
    encounter_id: input.encounterId,
    pharmacy_id: input.pharmacyId,
    sent_by: input.sentBy ?? null,
    doctor_id: input.doctor.id,
    doctor_name: input.doctor.name,
    doctor_phone: input.doctor.phone,
    doctor_email: input.doctor.email,
    clinic_location_id: input.clinic.locationId,
    clinic_name: input.clinic.name,
    clinic_address: input.clinic.address,
    clinic_phone: input.clinic.phone,
    clinic_email: input.clinic.email,
  }

  const legacyRow = {
    encounter_id: input.encounterId,
    pharmacy_id: input.pharmacyId,
    sent_by: input.sentBy ?? null,
  }

  let result = await admin.from('pharm_email_log').insert(fullRow).select(LOG_SELECT).single()

  if (result.error?.code === '42703') {
    result = await admin.from('pharm_email_log').insert(legacyRow).select('id, encounter_id, pharmacy_id, sent_at, sent_by').single()
  }

  if (result.error) throw result.error
  return result.data as PharmEmailLogRow
}
