import { createBrowserClient } from '@supabase/ssr'
import { getExternalSupabasePublishableKey, getExternalSupabaseUrl } from '@/lib/supabase/external-keys'

/**
 * Optional browser client for external project (publishable key).
 * Use only when external table RLS/policies are configured for safe public access.
 */
export function createExternalClient() {
  return createBrowserClient(
    getExternalSupabaseUrl(),
    getExternalSupabasePublishableKey()
  )
}
