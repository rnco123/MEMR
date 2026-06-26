import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_TENANT_ID = 1

type EncounterLocationRef = {
  appointment_id?: number | null
}

/** Tenant for consent forms: encounter appointment → location → tenant_id. */
export async function resolveEncounterTenantId(
  admin: SupabaseClient,
  encounter: EncounterLocationRef
): Promise<number> {
  if (encounter.appointment_id == null) return DEFAULT_TENANT_ID

  const { data: appt } = await admin
    .from('appointments')
    .select('location_id')
    .eq('id', encounter.appointment_id)
    .maybeSingle()

  const locationId = appt?.location_id
  if (locationId == null) return DEFAULT_TENANT_ID

  const { data: location } = await admin
    .from('locations')
    .select('tenant_id')
    .eq('id', locationId)
    .maybeSingle()

  const tenantId = location?.tenant_id
  if (tenantId == null) return DEFAULT_TENANT_ID
  const n = Number(tenantId)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TENANT_ID
}
