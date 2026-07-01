import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { fetchProfileFields } from '@/lib/fetch-user-role'
import { resolveDoctorRowId } from '@/lib/encounters/access-helpers'
import { isPhysicianRole } from '@/lib/roles'
import {
  loadEncounterForRx,
  selectPrescriptionsForEncounter,
} from '@/lib/prescriptions/encounter-prescriptions'

export type PrescriptionReadyAdminStatus = 'pending' | 'sent_to_pharmacy'

export type PrescriptionReadyRow = {
  id: number
  encounter_id: number
  patient_id: number
  prescription_id: number
  pharmacy_id: number | null
  sent_by: string | null
  sender_doctor_id: number | null
  sender_role: string
  sender_name: string | null
  admin_status: PrescriptionReadyAdminStatus
  sent_to_admin_at: string
  admin_status_updated_at: string | null
  admin_status_updated_by: string | null
}

export async function isEncounterPrescriptionsReleased(
  admin: SupabaseClient,
  encounterId: number
): Promise<boolean> {
  const { count, error } = await admin
    .from('prescription_ready')
    .select('id', { count: 'exact', head: true })
    .eq('encounter_id', encounterId)

  if (error) throw error
  return (count ?? 0) > 0
}

export async function listPrescriptionReadyForEncounter(
  admin: SupabaseClient,
  encounterId: number
): Promise<PrescriptionReadyRow[]> {
  const { data, error } = await admin
    .from('prescription_ready')
    .select(
      'id, encounter_id, patient_id, prescription_id, pharmacy_id, sent_by, sender_doctor_id, sender_role, sender_name, admin_status, sent_to_admin_at, admin_status_updated_at, admin_status_updated_by'
    )
    .eq('encounter_id', encounterId)
    .order('sent_to_admin_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as PrescriptionReadyRow[]
}

export async function assertEncounterPrescriptionsEditable(
  admin: SupabaseClient,
  encounterId: number
): Promise<void> {
  if (await isEncounterPrescriptionsReleased(admin, encounterId)) {
    throw new ValidationError('Prescriptions were sent to the pharmacy and cannot be changed')
  }
}

export async function releaseEncounterPrescriptionsToAdmin(
  admin: SupabaseClient,
  args: {
    encounterId: number
    userId: string
    userEmail?: string | null
    role: string
  }
): Promise<PrescriptionReadyRow[]> {
  if (!isPhysicianRole(args.role)) {
    throw new ValidationError('Only physicians can send prescriptions to the pharmacy')
  }

  if (await isEncounterPrescriptionsReleased(admin, args.encounterId)) {
    throw new ValidationError('Prescriptions were already sent to the pharmacy for this encounter')
  }

  const encounter = await loadEncounterForRx(admin, args.encounterId)
  const prescriptions = await selectPrescriptionsForEncounter(admin, args.encounterId)

  if (prescriptions.length === 0) {
    throw new ValidationError('Add at least one prescription before sending')
  }

  if (encounter.doctor_id == null) {
    throw new ValidationError('Assign a provider to this encounter before sending prescriptions')
  }

  const senderDoctorId = await resolveDoctorRowId(admin, args.userId)
  const profile = await fetchProfileFields(admin, args.userId, 'full_name, email', {
    email: args.userEmail,
  })
  const senderName =
    (typeof profile?.full_name === 'string' && profile.full_name.trim()) ||
    (typeof profile?.email === 'string' && profile.email) ||
    args.userEmail ||
    'Unknown'

  const rows = prescriptions.map((rx) => ({
    encounter_id: args.encounterId,
    patient_id: encounter.patient_id,
    prescription_id: rx.id,
    pharmacy_id: encounter.pharmacy_id,
    sent_by: args.userId,
    sender_doctor_id: senderDoctorId,
    sender_role: args.role,
    sender_name: senderName,
    admin_status: 'pending' as const,
  }))

  const { data, error } = await admin.from('prescription_ready').insert(rows).select(
    'id, encounter_id, patient_id, prescription_id, pharmacy_id, sent_by, sender_doctor_id, sender_role, sender_name, admin_status, sent_to_admin_at, admin_status_updated_at, admin_status_updated_by'
  )

  if (error) throw error
  return (data ?? []) as PrescriptionReadyRow[]
}
