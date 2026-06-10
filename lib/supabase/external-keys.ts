/**
 * Secondary Supabase project keys (optional integration).
 *
 * Use these when you want to read/write tables in another Supabase project
 * without using that project's auth in this app.
 */

export function isExternalSupabaseConfigured(): boolean {
  const url = process.env.EXTERNAL_SUPABASE_URL
  const key =
    process.env.EXTERNAL_SUPABASE_SECRET_KEY ||
    process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY
  return Boolean(url && key)
}

export function getExternalSupabaseUrl(): string {
  const url = process.env.EXTERNAL_SUPABASE_URL
  if (!url) {
    throw new Error('Missing EXTERNAL_SUPABASE_URL')
  }
  return url
}

/** Safe to expose in browser if RLS is enabled on external project tables. */
export function getExternalSupabasePublishableKey(): string {
  const key =
    process.env.EXTERNAL_SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXTERNAL_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error(
      'Missing external public key: set EXTERNAL_SUPABASE_PUBLISHABLE_KEY or EXTERNAL_SUPABASE_ANON_KEY'
    )
  }
  return key
}

/** Server-only privileged key for table operations. */
export function getExternalSupabaseSecretKey(): string {
  const key =
    process.env.EXTERNAL_SUPABASE_SECRET_KEY ||
    process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      'Missing external secret key: set EXTERNAL_SUPABASE_SECRET_KEY or EXTERNAL_SUPABASE_SERVICE_ROLE_KEY'
    )
  }
  return key
}

/**
 * Comma-separated allowlist (recommended), e.g.:
 * EXTERNAL_SUPABASE_ALLOWED_TABLES=patients,appointments,encounters
 */
export function getExternalSupabaseAllowedTables(): string[] {
  const raw = process.env.EXTERNAL_SUPABASE_ALLOWED_TABLES || ''
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
