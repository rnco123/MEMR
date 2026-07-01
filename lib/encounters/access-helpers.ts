import type { SupabaseClient } from '@supabase/supabase-js'
import {
  UserRole,
  canEditClinicalEncounterContent,
  isPhysicianRole,
} from '@/lib/roles'

export function isEncounterCompleted(status: string | null | undefined): boolean {
  return status === 'completed'
}

export async function resolveDoctorRowId(
  adminClient: SupabaseClient,
  userId: string
): Promise<number | null> {
  const { data } = await adminClient
    .from('doctors')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.id ?? null
}

/** Mirrors `ENCOUNTER_WRITE_ACCESS` — who may mutate encounter workflow in the UI. */
export async function resolveEncounterWriteAllowed(
  adminClient: SupabaseClient,
  userId: string,
  role: UserRole,
  encounter: { doctor_id?: number | null }
): Promise<boolean> {
  if (!canEditClinicalEncounterContent(role)) return false
  if (isPhysicianRole(role)) {
    const doctorRowId = await resolveDoctorRowId(adminClient, userId)
    return doctorRowId != null && encounter.doctor_id === doctorRowId
  }
  return true
}
