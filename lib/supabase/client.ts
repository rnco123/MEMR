import { createBrowserClient } from '@supabase/ssr'
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/keys'

/**
 * Browser client must NOT use localStorage-only auth storage: middleware and Route Handlers
 * read the session from cookies (`sb-<project>-auth-token`). Overriding `storage` breaks
 * that sync and causes redirect loops (/dashboard → /?redirectedFrom=…).
 */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey())
}
