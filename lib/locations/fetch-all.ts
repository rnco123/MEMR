import type { SupabaseClient } from '@supabase/supabase-js'

export type LocationOption = {
  id: number
  title: string
  location_code?: string | null
  address?: string | null
}

const LOCATIONS_PAGE_SIZE = 500

/** Load every clinic row from `locations` (PostgREST default caps can hide rows). */
export async function fetchAllLocations(admin: SupabaseClient): Promise<LocationOption[]> {
  const rows: LocationOption[] = []
  let from = 0

  while (true) {
    const { data, error } = await admin
      .from('locations')
      .select('id, title, location_code, address')
      .order('title', { ascending: true })
      .range(from, from + LOCATIONS_PAGE_SIZE - 1)

    if (error) throw error
    const page = (data ?? []) as LocationOption[]
    rows.push(...page)
    if (page.length < LOCATIONS_PAGE_SIZE) break
    from += LOCATIONS_PAGE_SIZE
  }

  return rows
}
