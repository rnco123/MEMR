import type { SupabaseClient } from '@supabase/supabase-js'
import { ValidationError } from '@/lib/api-error-handler'
import { insertStatusTimeline } from '@/lib/status-timeline'

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

export async function saveEncounterVitals(
  admin: SupabaseClient,
  args: {
    encounterId: number
    vitals: VitalsRecordInput
    profileId?: string | null
  }
): Promise<{ success: true }> {
  const { encounterId, vitals, profileId } = args

  const { data: encounter, error: encErr } = await admin
    .from('encounters')
    .select('id')
    .eq('id', encounterId)
    .maybeSingle()

  if (encErr) throw encErr
  if (!encounter) throw new ValidationError('Encounter not found')

  const { error: vitalsError } = await admin.from('vitals').insert({
    encounter_id: encounterId,
    bp_systolic: vitals.bp_systolic ?? null,
    bp_diastolic: vitals.bp_diastolic ?? null,
    heart_rate: vitals.heart_rate ?? null,
    respiratory_rate: vitals.respiratory_rate ?? null,
    temperature: vitals.temperature ?? null,
    temperature_unit: vitals.temperature_unit ?? null,
    spo2: vitals.spo2 ?? null,
    weight: vitals.weight ?? null,
    weight_unit: vitals.weight_unit ?? null,
    height: vitals.height ?? null,
    height_unit: vitals.height_unit ?? null,
    bmi: vitals.bmi ?? null,
    notes: vitals.notes ?? null,
  })

  if (vitalsError) throw vitalsError

  const { error: statusError } = await admin
    .from('encounters')
    .update({
      status: 'vitals_assessed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', encounterId)

  if (statusError) throw statusError

  if (profileId) {
    await insertStatusTimeline(admin, {
      encounterId,
      status: 'vitals_assessed',
      profileId,
    })
  }

  return { success: true }
}
