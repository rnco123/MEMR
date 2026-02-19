import { createClient } from '@supabase/supabase-js'
import { config } from '@/lib/config'

/**
 * Service role client - bypasses RLS.
 * Use only in API routes after verifying user auth.
 */
export function createAdminClient() {
  return createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
