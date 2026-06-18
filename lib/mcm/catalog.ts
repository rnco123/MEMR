import type { SupabaseClient } from '@supabase/supabase-js'

/** Canonical shape returned to the Final Review UI (matches `products` / `product_memr`). */
export type McmCategoryRow = { category_id: number; category_name: string }

export type McmProductRow = {
  product_id: number
  product_name: string
  category_id: number | null
  archived?: boolean | null
}

/** Reads categories from primary DB — tries MCM-style `categories`, then `category_memr`. */
export async function fetchMcmCategories(client: SupabaseClient): Promise<McmCategoryRow[]> {
  const primary = await client
    .from('categories')
    .select('category_id, category_name')
    .order('category_name', { ascending: true })

  if (!primary.error) {
    return (primary.data as McmCategoryRow[]) ?? []
  }

  const fallback = await client.from('category_memr').select('id, name').order('name', { ascending: true })

  if (fallback.error) throw primary.error

  return (fallback.data || []).map((r: { id: number; name: string }) => ({
    category_id: Number(r.id),
    category_name: r.name,
  }))
}

/** Reads products from primary DB — tries `products`, then `product_memr`. */
export async function fetchMcmProducts(
  client: SupabaseClient,
  categoryId: number | null
): Promise<McmProductRow[]> {
  let q = client
    .from('products')
    .select('product_id, product_name, category_id, archived')
    .order('product_name', { ascending: true })

  if (categoryId !== null) {
    q = q.eq('category_id', categoryId)
  }

  const primary = await q

  if (!primary.error) {
    const rows = (primary.data as McmProductRow[]) ?? []
    return rows.filter((p) => p.archived !== true)
  }

  let fq = client.from('product_memr').select('id, name, category_id').order('name', { ascending: true })
  if (categoryId !== null) {
    fq = fq.eq('category_id', categoryId)
  }
  const fallback = await fq

  if (fallback.error) throw primary.error

  return (fallback.data || []).map((r: { id: number; name: string; category_id: number | null }) => ({
    product_id: Number(r.id),
    product_name: r.name,
    category_id: r.category_id != null ? Number(r.category_id) : null,
    archived: false,
  }))
}

export async function fetchMcmProductsByIds(
  client: SupabaseClient,
  ids: number[]
): Promise<McmProductRow[]> {
  if (ids.length === 0) return []

  const primary = await client
    .from('products')
    .select('product_id, product_name, category_id, archived')
    .in('product_id', ids)

  if (!primary.error && primary.data && primary.data.length > 0) {
    return (primary.data as McmProductRow[]).filter((p) => p.archived !== true)
  }

  const fallback = await client.from('product_memr').select('id, name, category_id').in('id', ids)

  if (fallback.error) {
    if (!primary.error) return []
    throw fallback.error
  }

  return (fallback.data || []).map((r: { id: number; name: string; category_id: number | null }) => ({
    product_id: Number(r.id),
    product_name: r.name,
    category_id: r.category_id != null ? Number(r.category_id) : null,
    archived: false,
  }))
}
