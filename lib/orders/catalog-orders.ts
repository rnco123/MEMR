import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFoundError, ValidationError } from '@/lib/api-error-handler'

export type CatalogOrderKind = 'lab' | 'medication'

export const CATALOG_ORDER_CONFIG = {
  lab: {
    table: 'lab_orders',
    productTable: 'labs_products',
    productColumn: 'lab_product_id',
    select:
      'id, encounter_id, lab_product_id, qty, created_at, updated_at, product:lab_product_id(id, category, product, price)',
  },
  medication: {
    table: 'medication_orders',
    productTable: 'medication_products',
    productColumn: 'medication_product_id',
    select:
      'id, encounter_id, medication_product_id, qty, created_at, updated_at, product:medication_product_id(id, category, product, price)',
  },
} as const

export function parseCatalogOrderKind(value: string | undefined): CatalogOrderKind {
  if (value === 'lab' || value === 'medication') return value
  throw new ValidationError('Invalid catalog order type')
}

export function parsePositiveId(value: string | undefined, label: string): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError(`Invalid ${label}`)
  return id
}

export async function assertEncounterOrdersEditable(
  admin: SupabaseClient,
  encounterId: number
): Promise<void> {
  const { data, error } = await admin
    .from('encounters')
    .select('id, status')
    .eq('id', encounterId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new NotFoundError('Encounter not found')
  if (data.status === 'completed') {
    throw new ValidationError('Orders cannot be changed after the encounter is completed')
  }
}
