import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/keys'

/**
 * Browser client must NOT use localStorage-only auth storage: middleware and Route Handlers
 * read the session from cookies (`sb-<project>-auth-token`). Overriding `storage` breaks
 * that sync and causes redirect loops (/dashboard → /?redirectedFrom=…).
 *
 * Single instance avoids concurrent auth lock acquisition (AbortError in auth-js locks.js).
 */
let browserClient: SupabaseClient | undefined

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey())
  }
  return browserClient
}
