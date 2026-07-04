import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePharmacyRow } from '@/lib/pharmacies/normalize'
import { sanitizePatientSearchTerm } from '@/lib/nurse/patient-search-query'

const PHARMACY_REGISTRY_SELECT =
  'id, name, address, city, state, zip_code, phone, phone_number, email, is_active'

// Default initial list size. There can be thousands of pharmacies, so the
// picker searches server-side once the nurse types (see MIN_SEARCH_CHARS in the
// editor) — this cap only bounds the pre-search default list.
const MAX_REGISTRY = 500
const SEARCH_RESULT_LIMIT = 50

export type PharmacyRegistryOptions = {
  /** Server-side search across name/address/phone/email/id. */
  search?: string | null
  /** Row cap. Defaults to 500 (default list) or 50 (search results). */
  limit?: number
}

export async function loadActivePharmacyRegistry(
  admin: SupabaseClient,
  options: PharmacyRegistryOptions = {}
) {
  const search = sanitizePatientSearchTerm((options.search ?? '').trim())
  const limit = Math.min(
    options.limit ?? (search ? SEARCH_RESULT_LIMIT : MAX_REGISTRY),
    MAX_REGISTRY
  )

  let query = admin
    .from('pharmacy')
    .select(PHARMACY_REGISTRY_SELECT)
    // Active-only. Combined with the search .or() below via AND.
    .or('is_active.is.null,is_active.eq.true')

  if (search) {
    const term = `%${search}%`
    const filters = [
      `name.ilike.${term}`,
      `address.ilike.${term}`,
      `phone.ilike.${term}`,
      `phone_number.ilike.${term}`,
      `email.ilike.${term}`,
    ]
    const num = parseInt(search, 10)
    if (!Number.isNaN(num)) filters.push(`id.eq.${num}`)
    query = query.or(filters.join(','))
  }

  const { data, error } = await query.order('name').limit(limit)

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
