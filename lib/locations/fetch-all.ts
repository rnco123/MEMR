import type { SupabaseClient } from '@supabase/supabase-js'

export type LocationOption = {
  id: number
  title: string
  tenant_id?: number
  location_code?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  opening_hours?: string | null
  google_map_url?: string | null
  is_active?: boolean
}

const LOCATIONS_PAGE_SIZE = 500
const LOCATION_SELECT =
  'id, title, tenant_id, location_code, address, phone, email, opening_hours, google_map_url, is_active'

type FetchAllLocationsOptions = {
  activeOnly?: boolean
}

/** Load every clinic row from `locations` (PostgREST default caps can hide rows). */
export async function fetchAllLocations(
  admin: SupabaseClient,
  options: FetchAllLocationsOptions = {}
): Promise<LocationOption[]> {
  const activeOnly = options.activeOnly !== false
  const rows: LocationOption[] = []
  let from = 0

  while (true) {
    let query = admin
      .from('locations')
      .select(LOCATION_SELECT)
      .order('title', { ascending: true })
      .range(from, from + LOCATIONS_PAGE_SIZE - 1)

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) throw error
    const page = (data ?? []) as LocationOption[]
    rows.push(...page)
    if (page.length < LOCATIONS_PAGE_SIZE) break
    from += LOCATIONS_PAGE_SIZE
  }

  return rows
}
