import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchProfileFields } from '@/lib/fetch-user-role'
import type { EncounterRxRow } from '@/lib/prescriptions/encounter-prescriptions'

export type PrescriptionAuditAction = 'create' | 'update' | 'cancel'

export type PrescriptionAuditSummary = {
  editor_name: string | null
  editor_role: string | null
  action: PrescriptionAuditAction
  medication_name: string | null
  created_at: string
} | null

function rxSnapshot(row: Partial<EncounterRxRow>) {
  return {
    medication_name: row.medication_name ?? null,
    strength: row.strength ?? null,
    dosage_instruction: row.dosage_instruction ?? row.instructions ?? row.dosage ?? null,
    route: row.route ?? null,
    frequency: row.frequency ?? null,
    duration: row.duration ?? null,
    quantity: row.quantity ?? null,
    refills: row.refills ?? null,
    notes: row.notes ?? null,
    status: row.status ?? null,
  }
}

export async function logPrescriptionAudit(
  admin: SupabaseClient,
  args: {
    encounterId: number
    patientId: number
    prescriptionId: number
    action: PrescriptionAuditAction
    userId: string
    role: string
    userEmail?: string | null
    snapshot: Partial<EncounterRxRow>
  }
): Promise<PrescriptionAuditSummary> {
  const profile = await fetchProfileFields(admin, args.userId, 'full_name, email', {
    email: args.userEmail,
  })
  const editorName =
    (typeof profile?.full_name === 'string' && profile.full_name.trim()) ||
    (typeof profile?.email === 'string' && profile.email) ||
    args.userEmail ||
    'Unknown'

  const snap = rxSnapshot(args.snapshot)
  const { error } = await admin.from('prescription_audit').insert({
    encounter_id: args.encounterId,
    patient_id: args.patientId,
    prescription_id: args.prescriptionId,
    action: args.action,
    edited_by: args.userId,
    editor_role: args.role,
    editor_name: editorName,
    ...snap,
  })

  if (error) throw error

  return {
    editor_name: editorName,
    editor_role: args.role,
    action: args.action,
    medication_name: snap.medication_name,
    created_at: new Date().toISOString(),
  }
}

export async function loadLatestPrescriptionAuditForEncounter(
  admin: SupabaseClient,
  encounterId: number
): Promise<PrescriptionAuditSummary> {
  const { data, error } = await admin
    .from('prescription_audit')
    .select('editor_name, editor_role, action, medication_name, created_at')
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return data as PrescriptionAuditSummary
}
