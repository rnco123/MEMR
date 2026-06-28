import type { SupabaseClient } from '@supabase/supabase-js'
import { ENCOUNTER_ORDER_SELECT } from '@/lib/encounters/encounter-detail-selects'

const DEFAULT_ENCOUNTER_ORDERS_LIMIT = 100

export async function loadEncounterOrders(
  client: SupabaseClient,
  encounterId: number,
  limit = DEFAULT_ENCOUNTER_ORDERS_LIMIT
) {
  const { data, error } = await client
    .from('encounter_orders')
    .select(ENCOUNTER_ORDER_SELECT)
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as Record<string, unknown>[]
}
