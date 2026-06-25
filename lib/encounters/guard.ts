import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertEncounterAccess,
  assertOrderAccess,
  assertPatientAccess,
  assertPostVisitTaskAccess,
  type EncounterAccessOptions,
} from '@/lib/encounters/assert-access'

/** Returns admin client after verifying encounter access. */
export async function guardEncounterAccess(
  userId: string,
  encounterId: number,
  options?: EncounterAccessOptions
): Promise<SupabaseClient> {
  const admin = createAdminClient()
  await assertEncounterAccess(admin, userId, encounterId, options)
  return admin
}

/**
 * I-693: location-scoped only — physicians at the same clinic may view/edit without
 * being the assigned encounter doctor (workflow changes are audit-logged).
 */
export const I693_ENCOUNTER_ACCESS: EncounterAccessOptions = {
  requireDoctorAssignment: false,
}

export async function guardI693EncounterAccess(
  userId: string,
  encounterId: number
): Promise<SupabaseClient> {
  return guardEncounterAccess(userId, encounterId, I693_ENCOUNTER_ACCESS)
}

export async function guardPatientAccess(userId: string, patientId: number): Promise<SupabaseClient> {
  const admin = createAdminClient()
  await assertPatientAccess(admin, userId, patientId)
  return admin
}

export async function guardOrderAccess(userId: string, orderId: number): Promise<SupabaseClient> {
  const admin = createAdminClient()
  await assertOrderAccess(admin, userId, orderId)
  return admin
}

export async function guardPostVisitTaskAccess(userId: string, taskId: number): Promise<SupabaseClient> {
  const admin = createAdminClient()
  await assertPostVisitTaskAccess(admin, userId, taskId)
  return admin
}
