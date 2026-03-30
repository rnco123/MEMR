import { createClient } from '@supabase/supabase-js'
import { config } from '@/lib/config'

/** Supabase client that acts as the signed-in user (RLS applies). Same as browser. */
export function createSupabaseWithAccessToken(accessToken: string) {
  const key = config.supabase.publishableKey || config.supabase.anonKey
  return createClient(config.supabase.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export function hasServiceRoleKey(): boolean {
  return Boolean((config.supabase.serviceRoleKey || '').trim())
}
