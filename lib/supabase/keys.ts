/**
 * Supabase API keys — supports new Dashboard keys and legacy JWT keys.
 *
 * - Public: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…) or NEXT_PUBLIC_SUPABASE_ANON_KEY (legacy)
 * - Server: SUPABASE_SECRET_KEY (sb_secret_…) or SUPABASE_SERVICE_ROLE_KEY (legacy)
 *
 * @see https://supabase.com/docs/guides/api/api-keys
 */

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  }
  return url
}

/** Safe for browser, middleware, and server client (RLS applies). */
export function getSupabasePublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error(
      'Missing Supabase public key: set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )
  }
  return key
}

/** Server-only — bypasses RLS; never import in client bundles. */
export function getSupabaseSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('Missing Supabase secret key: set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY')
  }
  return key
}
