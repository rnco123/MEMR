/**
 * Fetch user role from profiles table.
 * Uses profiles.id (production schema). Falls back to profiles.uid or user_profiles.id if needed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type FetchProfileFieldsOptions = {
  /** When id/uid lookups miss (legacy rows), match profiles.email to the auth user email */
  email?: string | null
}

/**
 * Load profile columns for a Supabase Auth user id — tries `profiles.id`, then `profiles.uid`, then `user_profiles`,
 * then `profiles.email` when `options.email` is set.
 */
export async function fetchProfileFields(
  supabase: SupabaseClient,
  userId: string,
  fields: string,
  options?: FetchProfileFieldsOptions
): Promise<Record<string, unknown> | null> {
  const a = await supabase.from('profiles').select(fields).eq('id', userId).maybeSingle()
  if (a.data != null) return a.data as unknown as Record<string, unknown>

  const b = await supabase.from('profiles').select(fields).eq('uid', userId).maybeSingle()
  if (b.data != null) return b.data as unknown as Record<string, unknown>

  const c = await supabase.from('user_profiles').select('role, full_name').eq('id', userId).maybeSingle()
  if (c.data != null) {
    return { role: c.data.role, full_name: c.data.full_name, email: null } as Record<string, unknown>
  }

  const em = options?.email?.trim()
  if (em) {
    const d = await supabase.from('profiles').select(fields).eq('email', em).maybeSingle()
    if (d.data != null) return d.data as unknown as Record<string, unknown>
    const d2 = await supabase.from('profiles').select(fields).ilike('email', em).maybeSingle()
    if (d2.data != null) return d2.data as unknown as Record<string, unknown>
  }

  return null
}

export async function fetchUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<{ role: string } | null> {
  const profile = await fetchProfileFields(supabase, userId, 'role')
  if (profile?.role != null && typeof profile.role === 'string') {
    return { role: profile.role }
  }
  return null
}
