/**
 * Print external Supabase migration SQL for manual / MCP apply.
 *
 * Usage:
 *   node scripts/sync-external-supabase.cjs
 *   node scripts/sync-external-supabase.cjs --file 001_tenants_and_locations_tenant.sql
 *
 * Env: EXTERNAL_SUPABASE_URL (e.g. https://vsvueqtgulraaczqnnvh.supabase.co)
 * Apply via Supabase Dashboard SQL editor or MCP apply_migration on that project ref.
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const externalDir = path.join(root, 'supabase', 'migrations', 'external')
const fileArg = process.argv.find((arg) => arg.startsWith('--file='))
const singleFile = fileArg ? fileArg.slice('--file='.length) : process.argv[2]

function projectRefFromUrl(url) {
  try {
    const host = new URL(url).hostname
    return host.split('.')[0] || null
  } catch {
    return null
  }
}

const externalUrl = process.env.EXTERNAL_SUPABASE_URL || ''
const projectRef = projectRefFromUrl(externalUrl)

if (!fs.existsSync(externalDir)) {
  console.error('[sync-external] Missing directory:', externalDir)
  process.exit(1)
}

const files = fs
  .readdirSync(externalDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()

const selected = singleFile ? files.filter((name) => name === singleFile || name.includes(singleFile)) : files

if (selected.length === 0) {
  console.error('[sync-external] No migration files found.')
  process.exit(1)
}

console.log('External Supabase sync')
console.log('URL:', externalUrl || '(set EXTERNAL_SUPABASE_URL)')
console.log('Project ref:', projectRef || '(unknown)')
console.log('Migrations:', selected.join(', '))
console.log('')
console.log('Apply each file with Supabase MCP apply_migration or Dashboard SQL editor.')
console.log('This does NOT touch NEXT_PUBLIC_SUPABASE_URL (primary app database).')
console.log('')

for (const name of selected) {
  const fullPath = path.join(externalDir, name)
  const sql = fs.readFileSync(fullPath, 'utf8')
  console.log('---', name, '---')
  console.log(sql.trim())
  console.log('')
}
