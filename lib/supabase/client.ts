import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser client must NOT use localStorage-only auth storage: middleware and Route Handlers
 * read the session from cookies (`sb-<project>-auth-token`). Overriding `storage` breaks
 * that sync and causes redirect loops (/dashboard → /?redirectedFrom=…).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
