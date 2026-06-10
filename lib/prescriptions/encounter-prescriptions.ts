import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { getDoctorRowId } from '@/lib/clinical'
import type { EncounterStatus } from '@/lib/encounter-status'

export type EncounterRxRow = {
  id: number
  patient_id: number
  encounter_id: number | null
  prescriber_doctor_id: number
  pharmacy_id: number | null
  medication_name: string
  dosage: string | null
  dosage_instruction: string | null
  instructions: string | null
  strength: string | null
  route: string | null
  frequency: string | null
  duration: string | null
  quantity: string | null
  refills: number
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

export type EncounterForRx = {
  id: number
  patient_id: number
  doctor_id: number | null
  pharmacy_id: number | null
  status: string
}

const EDITABLE_UNTIL: EncounterStatus = 'completed'

export function canEditEncounterPrescriptions(status: string | null | undefined): boolean {
  if (!status) return false
  return status !== EDITABLE_UNTIL
}

export async function loadEncounterForRx(
  supabase: SupabaseClient,
  encounterId: number
): Promise<EncounterForRx> {
  const { data, error } = await supabase
    .from('encounters')
    .select('id, patient_id, doctor_id, pharmacy_id, status')
    .eq('id', encounterId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new ValidationError('Encounter not found')
  return data as EncounterForRx
}

export function assertEncounterRxEditable(encounter: EncounterForRx): void {
  if (!canEditEncounterPrescriptions(encounter.status)) {
    throw new ValidationError('Prescriptions cannot be changed after the encounter is completed')
  }
}

export async function resolvePrescriberDoctorId(
  supabase: SupabaseClient,
  userId: string,
  encounterDoctorId: number | null
): Promise<number> {
  if (encounterDoctorId != null && Number.isFinite(encounterDoctorId)) {
    return Number(encounterDoctorId)
  }

  const selfDoctorId = await getDoctorRowId(supabase, userId)
  if (selfDoctorId != null) return selfDoctorId

  throw new ValidationError(
    'Assign a doctor to this encounter before adding prescriptions'
  )
}

export function buildPrescriptionInsertRow(input: {
  prescriberDoctorId: number
  patientId: number
  encounterId: number
  pharmacyId: number | null
  medication_name: string
  dosage?: string | null
  dosage_instruction?: string | null
  instructions?: string | null
  strength?: string | null
  route?: string | null
  frequency?: string | null
  duration?: string | null
  quantity?: string | null
  refills?: number
  notes?: string | null
}) {
  const dose =
    (input.dosage_instruction ?? input.instructions ?? input.dosage ?? '').trim() || null

  return {
    prescriber_doctor_id: input.prescriberDoctorId,
    patient_id: input.patientId,
    encounter_id: input.encounterId,
    pharmacy_id: input.pharmacyId,
    medication_name: input.medication_name.trim(),
    strength: input.strength?.trim() || null,
    dosage_instruction: dose,
    dosage: dose,
    instructions: dose,
    route: input.route?.trim() || null,
    frequency: input.frequency?.trim() || null,
    duration: input.duration?.trim() || null,
    quantity: input.quantity?.trim() || null,
    refills: input.refills ?? 0,
    status: 'recorded' as const,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  }
}

export const PRESCRIPTION_SELECT_FULL = `
  id,
  patient_id,
  encounter_id,
  prescriber_doctor_id,
  pharmacy_id,
  medication_name,
  dosage,
  dosage_instruction,
  instructions,
  strength,
  route,
  frequency,
  duration,
  quantity,
  refills,
  status,
  notes,
  created_at,
  updated_at
`

/** Legacy DBs before migration 070 — no pharmacy_id / clinical detail columns. */
export const PRESCRIPTION_SELECT_LEGACY = `
  id,
  patient_id,
  encounter_id,
  prescriber_doctor_id,
  medication_name,
  dosage,
  instructions,
  quantity,
  refills,
  status,
  notes,
  created_at,
  updated_at
`

export const PRESCRIPTION_SELECT = PRESCRIPTION_SELECT_FULL

function isMissingPrescriptionColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('prescriptions') && msg.includes('does not exist')
}

export function normalizePrescriptionRow(row: Record<string, unknown>): EncounterRxRow {
  const dose = (row.dosage_instruction ?? row.instructions ?? row.dosage ?? null) as string | null
  return {
    id: Number(row.id),
    patient_id: Number(row.patient_id),
    encounter_id: row.encounter_id != null ? Number(row.encounter_id) : null,
    prescriber_doctor_id: Number(row.prescriber_doctor_id),
    pharmacy_id: row.pharmacy_id != null ? Number(row.pharmacy_id) : null,
    medication_name: String(row.medication_name ?? ''),
    dosage: (row.dosage as string | null) ?? dose,
    dosage_instruction: (row.dosage_instruction as string | null) ?? dose,
    instructions: (row.instructions as string | null) ?? dose,
    strength: (row.strength as string | null) ?? null,
    route: (row.route as string | null) ?? null,
    frequency: (row.frequency as string | null) ?? null,
    duration: (row.duration as string | null) ?? null,
    quantity: (row.quantity as string | null) ?? null,
    refills: Number(row.refills ?? 0),
    status: String(row.status ?? 'recorded'),
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export async function selectPrescriptionsForEncounter(
  supabase: SupabaseClient,
  encounterId: number
): Promise<EncounterRxRow[]> {
  const full = await supabase
    .from('prescriptions')
    .select(PRESCRIPTION_SELECT_FULL)
    .eq('encounter_id', encounterId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })

  if (!full.error) {
    return (full.data ?? []).map((row) => normalizePrescriptionRow(row as Record<string, unknown>))
  }

  if (!isMissingPrescriptionColumnError(full.error)) throw full.error

  const legacy = await supabase
    .from('prescriptions')
    .select(PRESCRIPTION_SELECT_LEGACY)
    .eq('encounter_id', encounterId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })

  if (legacy.error) throw legacy.error
  return (legacy.data ?? []).map((row) => normalizePrescriptionRow(row as Record<string, unknown>))
}

export function buildPrescriptionInsertPayload(input: {
  prescriberDoctorId: number
  patientId: number
  encounterId: number
  pharmacyId: number | null
  medication_name: string
  dosage?: string | null
  dosage_instruction?: string | null
  instructions?: string | null
  strength?: string | null
  route?: string | null
  frequency?: string | null
  duration?: string | null
  quantity?: string | null
  refills?: number
  notes?: string | null
}) {
  const row = buildPrescriptionInsertRow(input)
  const legacy = { ...row }
  delete (legacy as Record<string, unknown>).pharmacy_id
  delete (legacy as Record<string, unknown>).strength
  delete (legacy as Record<string, unknown>).dosage_instruction
  delete (legacy as Record<string, unknown>).route
  delete (legacy as Record<string, unknown>).frequency
  delete (legacy as Record<string, unknown>).duration
  return { full: row, legacy }
}

export async function insertPrescriptionRow(
  supabase: SupabaseClient,
  input: Parameters<typeof buildPrescriptionInsertPayload>[0]
): Promise<EncounterRxRow> {
  const { full, legacy } = buildPrescriptionInsertPayload(input)

  const tryInsert = async (row: Record<string, unknown>, select: string) =>
    supabase.from('prescriptions').insert(row).select(select).single()

  let result = await tryInsert(full, PRESCRIPTION_SELECT_FULL)
  if (result.error && isMissingPrescriptionColumnError(result.error)) {
    result = await tryInsert(legacy, PRESCRIPTION_SELECT_LEGACY)
  }

  if (result.error) throw result.error
  return normalizePrescriptionRow(result.data as unknown as Record<string, unknown>)
}

export async function updatePrescriptionRow(
  supabase: SupabaseClient,
  encounterId: number,
  rxId: number,
  patch: Record<string, unknown>
): Promise<EncounterRxRow> {
  const fullPatch: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
  const legacyPatch: Record<string, unknown> = { ...fullPatch }
  delete legacyPatch.pharmacy_id
  delete legacyPatch.strength
  delete legacyPatch.dosage_instruction
  delete legacyPatch.route
  delete legacyPatch.frequency
  delete legacyPatch.duration

  const tryUpdate = async (body: Record<string, unknown>, select: string) =>
    supabase
      .from('prescriptions')
      .update(body)
      .eq('id', rxId)
      .eq('encounter_id', encounterId)
      .select(select)
      .single()

  let result = await tryUpdate(fullPatch, PRESCRIPTION_SELECT_FULL)
  if (result.error && isMissingPrescriptionColumnError(result.error)) {
    result = await tryUpdate(legacyPatch, PRESCRIPTION_SELECT_LEGACY)
  }

  if (result.error) throw result.error
  return normalizePrescriptionRow(result.data as unknown as Record<string, unknown>)
}
