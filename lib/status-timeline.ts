/**
 * Helpers for recording encounter status changes in public.status_timeline.
 * Table: status_timeline(created_at, status, profile, encounter, tid)
 * Pass profiles.id, encounter.id, and status when status is updated by nurse or doctor.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Encounter status values matching public.encounter_status_enum */
export type StatusTimelineStatus =
  | 'appointment_initiated'
  | 'provider_assigned'
  | 'vitals_assessed'
  | 'in_consultation'
  | 'consultation_concluded'
  | 'final_review'

/**
 * Get the profile id (UUID) for the current auth user.
 * Uses profiles.id first (production), then profiles.uid.
 */
export async function getProfileId(
  supabase: SupabaseClient,
  authUserId: string
): Promise<string | null> {
  // Try profiles.id (production schema)
  const result = await supabase
    .from('profiles')
    .select('id')
    .eq('id', authUserId)
    .maybeSingle()

  const isSchemaError =
    result.error &&
    (String(result.error.message || '').includes('42703') ||
      String(result.error.message || '').includes('undefined column') ||
      String(result.error.message || '').includes('42P01') ||
      (result.error as { code?: string })?.code === 'PGRST301')

  if (result.error && isSchemaError) {
    // Fallback: profiles.uid as PK (id may not exist; use uid as profile id)
    const fallback = await supabase
      .from('profiles')
      .select('uid')
      .eq('uid', authUserId)
      .maybeSingle()
    if (fallback.data) {
      return (fallback.data as { uid: string }).uid
    }
  }

  if (result.data && !result.error) {
    const row = result.data as { id?: string }
    return row.id ?? null
  }
  return null
}

/**
 * Insert a row into status_timeline for an encounter status change.
 * Call after updating encounters.status. profileId can be null (e.g. system).
 */
export async function insertStatusTimeline(
  supabase: SupabaseClient,
  payload: {
    encounterId: number
    status: StatusTimelineStatus
    profileId: string | null
  }
): Promise<{ error: unknown }> {
  const { error } = await supabase.from('status_timeline').insert({
    encounter: payload.encounterId,
    status: payload.status,
    profile: payload.profileId || null,
  })
  return { error }
}
