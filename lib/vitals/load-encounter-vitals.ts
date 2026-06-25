import type { SupabaseClient } from '@supabase/supabase-js'

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
}

export async function loadLatestVitalsForEncounter(
  admin: SupabaseClient,
  encounterId: number
): Promise<EncounterVitalsRow | null> {
  const { data, error } = await admin
    .from('vitals')
    .select(
      'id, encounter_id, bp_systolic, bp_diastolic, heart_rate, respiratory_rate, temperature, temperature_unit, spo2, weight, weight_unit, height, height_unit, bmi, notes, created_at'
    )
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as EncounterVitalsRow | null) ?? null
}
