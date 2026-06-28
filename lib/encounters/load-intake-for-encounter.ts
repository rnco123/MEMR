import type { SupabaseClient } from '@supabase/supabase-js'
import { INTAKE_FORM_DETAIL_SELECT } from '@/lib/encounters/encounter-detail-selects'

/** Resolve intake form by intake_id, then appointment_id fallback. */
export async function loadIntakeForEncounter(
  admin: SupabaseClient,
  intakeId: number | null,
  appointmentId: number | null
): Promise<Record<string, unknown> | null> {
  if (intakeId && Number.isFinite(intakeId)) {
    const { data, error } = await admin
      .from('intake_form')
      .select(INTAKE_FORM_DETAIL_SELECT)
      .eq('id', intakeId)
      .maybeSingle()
    if (error) throw error
    if (data) return data as Record<string, unknown>
  }

  if (appointmentId && Number.isFinite(appointmentId)) {
    const { data, error } = await admin
      .from('intake_form')
      .select(INTAKE_FORM_DETAIL_SELECT)
      .eq('appointment_id', appointmentId)
      .maybeSingle()
    if (error) throw error
    return (data as Record<string, unknown> | null) ?? null
  }

  return null
}
