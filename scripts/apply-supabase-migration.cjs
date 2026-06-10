/**
 * Apply a single SQL migration file to the primary Supabase Postgres database.
 *
 * Usage:
 *   node scripts/apply-supabase-migration.cjs 072_pharm_email_log.sql
 *
 * Env (one of):
 *   DATABASE_URL=postgresql://postgres.[ref]:[password]@...pooler.supabase.com:6543/postgres
 *   SUPABASE_DB_PASSWORD=...  (with NEXT_PUBLIC_SUPABASE_URL set in .env)
 */
const fs = require('fs')
const path = require('path')

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value
    }
  }
}

function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split('.')[0] || null
  } catch {
    return null
  }
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const password = process.env.SUPABASE_DB_PASSWORD || ''
  const ref = projectRefFromUrl(supabaseUrl)
  if (!ref || !password) return null

  const region = process.env.SUPABASE_DB_REGION || 'us-east-1'
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:6543/postgres`
}

async function main() {
  loadDotEnv()

  const fileArg = process.argv[2] || '072_pharm_email_log.sql'
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', fileArg)
  if (!fs.existsSync(migrationPath)) {
    console.error('[apply-migration] File not found:', migrationPath)
    process.exit(1)
  }

  const databaseUrl = resolveDatabaseUrl()
  if (!databaseUrl) {
    console.error(
      '[apply-migration] Set DATABASE_URL or SUPABASE_DB_PASSWORD (+ NEXT_PUBLIC_SUPABASE_URL) in .env'
    )
    console.error(
      '[apply-migration] Get the URI from Supabase Dashboard → Project Settings → Database → Connection string (URI).'
    )
    process.exit(1)
  }

  let postgres
  try {
    postgres = require('postgres')
  } catch {
    console.error('[apply-migration] Run: npm install postgres')
    process.exit(1)
  }

  const sqlText = fs.readFileSync(migrationPath, 'utf8')
  const sql = postgres(databaseUrl, { max: 1, ssl: 'require' })

  try {
    console.log('[apply-migration] Applying', fileArg, '…')
    await sql.unsafe(sqlText)
    console.log('[apply-migration] Done.')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('[apply-migration] Failed:', err.message || err)
  process.exit(1)
})
