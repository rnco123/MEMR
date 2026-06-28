import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePharmacyRow } from '@/lib/pharmacies/normalize'

const PHARMACY_REGISTRY_SELECT =
  'id, name, address, city, state, zip_code, phone, phone_number, email, is_active'

const MAX_REGISTRY = 500

export async function loadActivePharmacyRegistry(admin: SupabaseClient) {
  const { data, error } = await admin
    .from('pharmacy')
    .select(PHARMACY_REGISTRY_SELECT)
    .or('is_active.is.null,is_active.eq.true')
    .order('name')
    .limit(MAX_REGISTRY)

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((row) => normalizePharmacyRow(row))
}

export async function loadPharmacyById(admin: SupabaseClient, pharmacyId: number) {
  const { data, error } = await admin
    .from('pharmacy')
    .select(PHARMACY_REGISTRY_SELECT)
    .eq('id', pharmacyId)
    .maybeSingle()

  if (error) throw error
  return data ? normalizePharmacyRow(data as Record<string, unknown>) : null
}
