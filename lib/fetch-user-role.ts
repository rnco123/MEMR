/**
 * Fetch user role from profiles table.
 * Uses profiles.id (production schema). Falls back to profiles.uid or user_profiles.id if needed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function fetchUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<{ role: string } | null> {
  // Use profiles.id (production schema)
  let result = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  const isSchemaError =
    result.error &&
    (String(result.error.message || '').includes('42703') ||
      String(result.error.message || '').includes('undefined column') ||
      String(result.error.message || '').includes('42P01') ||
      (result.error as { code?: string })?.code === 'PGRST301')

  if (result.error && isSchemaError) {
    // Fallback: profiles.uid (migration 006 schema)
    result = await supabase
      .from('profiles')
      .select('role')
      .eq('uid', userId)
      .single()
  }

  if (result.error && isSchemaError) {
    // Fallback: user_profiles (migration 001)
    result = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single()
  }

  return result.data && !result.error ? { role: result.data.role } : null
}
