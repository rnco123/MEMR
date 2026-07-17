import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { encounterSectionAuditFromRow } from '@/lib/encounter/encounter-section-audit'
import { insertStatusTimeline } from '@/lib/status-timeline'
import { EMPTY_VITALS_FORM_INPUT, type VitalsFormInput } from '@/lib/vitals/vitals-form-ui'

export type VitalsRecordInput = {
  bp_systolic?: number | null
  bp_diastolic?: number | null
  heart_rate?: number | null
  respiratory_rate?: number | null
  temperature?: number | null
  temperature_unit?: string | null
  spo2?: number | null
  weight?: number | null
  weight_unit?: string | null
  height?: number | null
  height_unit?: string | null
  bmi?: number | null
  notes?: string | null
}

export type SaveEncounterVitalsEditor = {
  userId: string
  role: string
  editorName: string
}

/**
 * Encounter workflow order. Vitals recording should advance the encounter to
 * `vitals_assessed` only when it is still earlier in the flow — never regress an
 * encounter that is already in consultation or beyond.
 */
const ENCOUNTER_STATUS_ORDER = [
  'appointment_initiated',
  'provider_assigned',
  'vitals_assessed',
  'in_consultation',
  'consultation_concluded',
  'final_review',
  'completed',
] as const

function shouldAdvanceToVitalsAssessed(currentStatus: string | null | undefined): boolean {
  if (!currentStatus) return true
  const currentIndex = ENCOUNTER_STATUS_ORDER.indexOf(
    currentStatus as (typeof ENCOUNTER_STATUS_ORDER)[number]
  )
  const targetIndex = ENCOUNTER_STATUS_ORDER.indexOf('vitals_assessed')
  // Unknown status → be safe and don't touch it.
  if (currentIndex === -1) return false
  return currentIndex < targetIndex
}

const VITALS_SELECT =
  'id, encounter_id, bp_systolic, bp_diastolic, heart_rate, respiratory_rate, temperature, temperature_unit, spo2, weight, weight_unit, height, height_unit, bmi, notes, created_at, updated_at, edited_by, editor_role, editor_name'

export type EncounterVitalsRow = {
  id: number
  encounter_id: number
  bp_systolic: number | null
  bp_diastolic: number | null
  heart_rate: number | null
  respiratory_rate: number | null
  temperature: number | null
  temperature_unit: string | null
  spo2: number | null
  weight: number | null
  weight_unit: string | null
  height: number | null
  height_unit: string | null
  bmi: number | null
  notes: string | null
  created_at: string
  updated_at: string | null
  edited_by: string | null
  editor_role: string | null
  editor_name: string | null
}

export async function loadLatestVitalsForEncounter(
  admin: SupabaseClient,
  encounterId: number
): Promise<EncounterVitalsRow | null> {
  const { data, error } = await admin
    .from('vitals')
    .select(VITALS_SELECT)
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as EncounterVitalsRow | null) ?? null
}

export function vitalsLastAuditFromRow(row: Record<string, unknown> | null) {
  return encounterSectionAuditFromRow(row)
}

export async function saveEncounterVitals(
  admin: SupabaseClient,
  args: {
    encounterId: number
    vitals: VitalsRecordInput
    profileId?: string | null
    editor: SaveEncounterVitalsEditor
    mode?: 'insert' | 'upsert'
  }
): Promise<EncounterVitalsRow> {
  const { encounterId, vitals, profileId, editor, mode = 'insert' } = args

  const { data: encounter, error: encErr } = await admin
    .from('encounters')
    .select('id, status')
    .eq('id', encounterId)
    .maybeSingle()

  if (encErr) throw encErr
  if (!encounter) throw new ValidationError('Encounter not found')
  if (encounter.status === 'completed') {
    throw new ValidationError('Vitals cannot be changed after the encounter is completed')
  }

  const currentStatus = encounter.status as string | null

  const now = new Date().toISOString()
  const safe = sanitizeVitalsForDb(vitals)
  const rowPayload = {
    bp_systolic: safe.bp_systolic ?? null,
    bp_diastolic: safe.bp_diastolic ?? null,
    heart_rate: safe.heart_rate ?? null,
    respiratory_rate: safe.respiratory_rate ?? null,
    temperature: safe.temperature ?? null,
    temperature_unit: safe.temperature_unit ?? null,
    spo2: safe.spo2 ?? null,
    weight: safe.weight ?? null,
    weight_unit: safe.weight_unit ?? null,
    height: safe.height ?? null,
    height_unit: safe.height_unit ?? null,
    bmi: safe.bmi ?? null,
    notes: safe.notes ?? null,
    edited_by: editor.userId,
    editor_role: editor.role,
    editor_name: editor.editorName,
    updated_at: now,
  }

  let saved: EncounterVitalsRow

  if (mode === 'upsert') {
    const existing = await loadLatestVitalsForEncounter(admin, encounterId)
    if (existing?.id) {
      const { data, error } = await admin
        .from('vitals')
        .update(rowPayload)
        .eq('id', existing.id)
        .select(VITALS_SELECT)
        .single()
      if (error) throw error
      saved = data as EncounterVitalsRow
    } else {
      const { data, error } = await admin
        .from('vitals')
        .insert({ encounter_id: encounterId, ...rowPayload })
        .select(VITALS_SELECT)
        .single()
      if (error) throw error
      saved = data as EncounterVitalsRow
    }
  } else {
    const { data, error } = await admin
      .from('vitals')
      .insert({ encounter_id: encounterId, ...rowPayload })
      .select(VITALS_SELECT)
      .single()
    if (error) throw error
    saved = data as EncounterVitalsRow
  }

  // The vitals row is already persisted above. Everything below is best-effort
  // workflow bookkeeping — never throw here, or the API would return 500 for a
  // save that actually succeeded (causing duplicate retries from the client).
  if (shouldAdvanceToVitalsAssessed(currentStatus)) {
    const { error: statusError } = await admin
      .from('encounters')
      .update({
        status: 'vitals_assessed',
        updated_at: now,
      })
      .eq('id', encounterId)

    if (statusError) {
      console.error(
        `[vitals] Saved vitals ${saved.id} for encounter ${encounterId} but failed to advance status:`,
        statusError
      )
    } else if (profileId) {
      const { error: timelineError } = await insertStatusTimeline(admin, {
        encounterId,
        status: 'vitals_assessed',
        profileId,
      })
      if (timelineError) {
        console.error(
          `[vitals] Saved vitals ${saved.id} for encounter ${encounterId} but failed to write status timeline:`,
          timelineError
        )
      }
    }
  }

  return saved
}

export function vitalsRowToFormInput(row: EncounterVitalsRow | Record<string, unknown> | null): VitalsFormInput {
  if (!row) return { ...EMPTY_VITALS_FORM_INPUT }

  const toStr = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return ''
    return String(value)
  }

  return {
    bp_systolic: toStr(row.bp_systolic),
    bp_diastolic: toStr(row.bp_diastolic),
    heart_rate: toStr(row.heart_rate),
    respiratory_rate: toStr(row.respiratory_rate),
    temperature: toStr(row.temperature),
    temperature_unit: toStr(row.temperature_unit) || 'F',
    spo2: toStr(row.spo2),
    weight: toStr(row.weight),
    weight_unit: toStr(row.weight_unit) || 'lbs',
    height: toStr(row.height),
    height_unit: toStr(row.height_unit) || 'in',
    notes: toStr(row.notes),
  }
}

export function calculateVitalsBmi(args: {
  weight: string
  weight_unit: string
  height: string
  height_unit: string
}): number | null {
  if (!args.weight || !args.height) return null
  const weightKg =
    args.weight_unit === 'lbs' ? parseFloat(args.weight) * 0.453592 : parseFloat(args.weight)
  const heightM =
    args.height_unit === 'in'
      ? parseFloat(args.height) * 0.0254
      : parseFloat(args.height) / 100
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightM) || heightM <= 0) return null
  const bmi = weightKg / (heightM * heightM)
  if (!Number.isFinite(bmi) || bmi <= 0) return null
  // Keep within DB numeric(6,2) and reject nonsense calculation noise.
  if (bmi > 9999.99) return 9999.99
  return parseFloat(bmi.toFixed(1))
}

/** Round/clamp numeric vitals so inserts never overflow Postgres column precision. */
export function sanitizeVitalsForDb(vitals: VitalsRecordInput): VitalsRecordInput {
  const clamp = (value: number | null | undefined, maxAbs: number, decimals: number) => {
    if (value == null || !Number.isFinite(value)) return null
    const capped = Math.min(Math.max(value, -maxAbs), maxAbs)
    const factor = 10 ** decimals
    return Math.round(capped * factor) / factor
  }

  return {
    ...vitals,
    temperature: clamp(vitals.temperature ?? null, 9999.99, 2),
    weight: clamp(vitals.weight ?? null, 9999.99, 2),
    height: clamp(vitals.height ?? null, 9999.99, 2),
    bmi: clamp(vitals.bmi ?? null, 9999.99, 2),
  }
}
