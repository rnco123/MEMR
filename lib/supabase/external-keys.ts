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

/** Write mode disabled unless explicitly enabled (C-02d). */
export function isExternalSupabaseWriteAllowed(): boolean {
  return process.env.EXTERNAL_SUPABASE_ALLOW_WRITE === 'true'
}

/**
 * Per-table column allowlist from env, e.g.:
 * EXTERNAL_SUPABASE_COLUMNS_patients=id,first_name,last_name
 */
export function getExternalSupabaseAllowedColumns(table: string): string[] | null {
  const envKey = `EXTERNAL_SUPABASE_COLUMNS_${table.replace(/[^a-zA-Z0-9_]/g, '')}`
  const raw = process.env[envKey]
  if (!raw) return null
  const cols = raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  return cols.length > 0 ? cols : null
}

export function filterPayloadToAllowedColumns(
  table: string,
  payload: Record<string, unknown> | Record<string, unknown>[]
): Record<string, unknown> | Record<string, unknown>[] {
  const allowed = getExternalSupabaseAllowedColumns(table)
  if (!allowed) return payload

  const allowSet = new Set(allowed)
  const filterOne = (row: Record<string, unknown>) => {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(row)) {
      if (allowSet.has(key)) out[key] = row[key]
    }
    return out
  }

  if (Array.isArray(payload)) return payload.map(filterOne)
  return filterOne(payload)
}
