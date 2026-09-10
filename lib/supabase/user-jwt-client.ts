import { createClient } from '@supabase/supabase-js'
import { config } from '@/lib/config'

/** Supabase client that acts as the signed-in user (RLS applies). Same as browser. */
export function createSupabaseWithAccessToken(accessToken: string) {
  return createClient(config.supabase.url, config.supabase.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export function hasSecretKey(): boolean {
  return Boolean((config.supabase.secretKey || '').trim())
}
