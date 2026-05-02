import { createClient } from '@supabase/supabase-js'
import { getExternalSupabaseSecretKey, getExternalSupabaseUrl } from '@/lib/supabase/external-keys'

/**
 * Privileged client for a secondary Supabase project.
 * Intended for server-side route handlers only.
 */
export function createExternalAdminClient() {
  return createClient(
    getExternalSupabaseUrl(),
    getExternalSupabaseSecretKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
