/**
 * Supabase API keys.
 *
 * - Public: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…)
 * - Server: SUPABASE_SECRET_KEY (sb_secret_…)
 *
 * The legacy anon / service_role JWTs (eyJ…) are no longer read. They derive from the
 * project's JWT secret, so they cannot be revoked individually — rotating one invalidates
 * every legacy key on the project at once.
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
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…)')
  }
  return key
}

/** Server-only — bypasses RLS; never import in client bundles. */
export function getSupabaseSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) {
    throw new Error('Missing SUPABASE_SECRET_KEY (sb_secret_…)')
  }
  return key
}
