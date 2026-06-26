/**
 * One-time sync: copy rows present on STAGING but missing on PRODUCTION.
 *
 * Usage:
 *   STAGING_URL=https://kxtbfmlatysaxjzppmti.supabase.co \
 *   STAGING_SECRET_KEY=sb_secret_... \
 *   PROD_URL=https://bssjlpqdgmtgaxvadwdh.supabase.co \
 *   PROD_SECRET_KEY=sb_secret_... \
 *   node scripts/sync-staging-to-production.mjs --dry-run
 *
 * Options:
 *   --dry-run          Print counts only; no writes
 *   --sync-auth        Create auth users missing on production (random password; reset required)
 *   --sync-storage     Copy storage objects missing on production buckets
 *   --since=ISO_DATE   Only rows with created_at >= date (optional extra filter)
 *
 * Defaults STAGING_* from .env (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY).
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const syncAuth = args.has('--sync-auth')
const syncStorage = args.has('--sync-storage')
const sinceArg = [...args].find((a) => a.startsWith('--since='))
const since = sinceArg ? sinceArg.slice('--since='.length) : null

const stagingUrl = process.env.STAGING_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const stagingKey =
  process.env.STAGING_SECRET_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY
const prodUrl = process.env.PROD_URL
const prodKey = process.env.PROD_SECRET_KEY || process.env.PROD_SERVICE_ROLE_KEY

if (!stagingUrl || !stagingKey) {
  console.error('Missing STAGING_URL / STAGING_SECRET_KEY (or .env staging defaults)')
  process.exit(1)
}
if (!prodUrl || !prodKey) {
  console.error('Missing PROD_URL and PROD_SECRET_KEY')
  process.exit(1)
}

if (stagingUrl === prodUrl) {
  console.error('STAGING_URL and PROD_URL must differ')
  process.exit(1)
}

const staging = createClient(stagingUrl, stagingKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const prod = createClient(prodUrl, prodKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Tables in dependency order (parents before children). */
const TABLE_SYNC_ORDER = [
  { table: 'patients', pk: 'id' },
  { table: 'appointments', pk: 'id' },
  { table: 'intake_form', pk: 'id' },
  { table: 'encounters', pk: 'id' },
  { table: 'vitals', pk: 'id' },
  { table: 'ai_soapnotes', pk: 'id' },
  { table: 'doctor_soapnotes', pk: 'id' },
  { table: 'prescriptions', pk: 'id' },
  { table: 'signed_forms', pk: 'id' },
  { table: 'patient_documents', pk: 'id' },
  { table: 'patient_passport', pk: 'id' },
  { table: 'status_timeline', pk: 'tid' },
  { table: 'telemedicine_transcripts', pk: 'id' },
  { table: 'immigration_cases', pk: 'id' },
  { table: 'immigration_tasks', pk: 'id' },
  { table: 'i693_submissions', pk: 'id' },
  { table: 'encounter_physical_examinations', pk: 'id' },
  { table: 'encounter_physician_reviews', pk: 'id' },
  { table: 'soap_audit', pk: 'id' },
  { table: 'patient_info_audit', pk: 'id' },
  { table: 'pharm_email_log', pk: 'id' },
  { table: 'pharmacy', pk: 'id' },
  { table: 'audit_logs', pk: 'id' },
  { table: 'conversations', pk: 'id' },
  { table: 'messages', pk: 'id' },
  { table: 'chat_attachments', pk: 'id' },
  { table: 'support_tickets', pk: 'id' },
  { table: 'support_ticket_messages', pk: 'id' },
  { table: 'support_ticket_attachments', pk: 'id' },
  { table: 'profiles', pk: 'id' },
  { table: 'nurses', pk: 'id' },
  { table: 'doctors', pk: 'id' },
  { table: 'user_locations', pk: 'id' },
]

const STORAGE_BUCKETS = [
  'patient_consent_forms',
  'patient-documents',
  'passport-bucket',
  'HIPAACompliance_form',
  'chat-attachments',
  'support-attachments',
]

const PAGE = 1000

async function fetchAllIds(client, table, pk) {
  const ids = new Set()
  let from = 0
  while (true) {
    const { data, error } = await client.from(table).select(pk).range(from, from + PAGE - 1)
    if (error) throw new Error(`${table} id fetch: ${error.message}`)
    if (!data?.length) break
    for (const row of data) ids.add(row[pk])
    if (data.length < PAGE) break
    from += PAGE
  }
  return ids
}

async function fetchMissingRows(client, table, pk, missingIds) {
  if (missingIds.length === 0) return []
  const rows = []
  const chunks = chunk(missingIds, 200)
  for (const ids of chunks) {
    let q = client.from(table).select('*').in(pk, ids)
    if (since) q = q.gte('created_at', since)
    const { data, error } = await q
    if (error) throw new Error(`${table} fetch: ${error.message}`)
    if (data?.length) rows.push(...data)
  }
  return rows
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function stripGenerated(row) {
  const copy = { ...row }
  return copy
}

async function upsertRows(client, table, pk, rows) {
  if (!rows.length) return 0
  const chunks = chunk(rows, 100)
  let inserted = 0
  for (const batch of chunks) {
    const { error } = await client.from(table).upsert(batch.map(stripGenerated), {
      onConflict: pk,
      ignoreDuplicates: false,
    })
    if (error) throw new Error(`${table} upsert: ${error.message}`)
    inserted += batch.length
  }
  return inserted
}

async function syncTable({ table, pk }, uidMap) {
  const [stagingIds, prodIds] = await Promise.all([
    fetchAllIds(staging, table, pk),
    fetchAllIds(prod, table, pk),
  ])

  const missing = [...stagingIds].filter((id) => !prodIds.has(id))
  if (missing.length === 0) {
    console.log(`  ${table}: in sync`)
    return 0
  }

  let rows = await fetchMissingRows(staging, table, pk, missing)

  if (uidMap?.size && (table === 'profiles' || table === 'nurses' || table === 'doctors')) {
    rows = rows.map((r) => remapUid(r, uidMap))
  }

  console.log(`  ${table}: ${rows.length} row(s) to copy (${missing.length} id(s) missing on prod)`)

  if (dryRun || rows.length === 0) return rows.length

  const n = await upsertRows(prod, table, pk, rows)
  console.log(`  ${table}: copied ${n}`)
  return n
}

async function listAuthEmails(client) {
  const emails = new Set()
  let page = 1
  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    for (const u of data.users) {
      if (u.email) emails.add(u.email.toLowerCase())
    }
    if (data.users.length < 200) break
    page += 1
  }
  return emails
}

async function syncAuthUsers() {
  console.log('\nAuth users')
  const [stagingEmails, prodEmails] = await Promise.all([
    listAuthEmails(staging),
    listAuthEmails(prod),
  ])

  const missingEmails = [...stagingEmails].filter((e) => !prodEmails.has(e))
  if (missingEmails.length === 0) {
    console.log('  auth.users: in sync')
    return new Map()
  }

  console.log(`  ${missingEmails.length} user(s) on staging only:`)
  for (const email of missingEmails) console.log(`    - ${email}`)

  const uidMap = new Map()

  if (dryRun) return uidMap

  let page = 1
  const stagingUsers = []
  while (true) {
    const { data, error } = await staging.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    stagingUsers.push(...data.users)
    if (data.users.length < 200) break
    page += 1
  }

  for (const user of stagingUsers) {
    const email = user.email?.toLowerCase()
    if (!email || prodEmails.has(email)) continue

    const tempPassword = crypto.randomUUID() + 'Aa1!'
    const { data, error } = await prod.auth.admin.createUser({
      email: user.email,
      email_confirm: true,
      phone: user.phone,
      user_metadata: user.user_metadata ?? {},
      app_metadata: user.app_metadata ?? {},
      password: tempPassword,
    })
    if (error) {
      console.error(`  failed ${email}: ${error.message}`)
      continue
    }
    uidMap.set(user.id, data.user.id)
    console.log(`  created ${email} (${user.id} → ${data.user.id}) — password reset required`)
  }

  return uidMap
}

function remapUid(row, uidMap) {
  if (!row?.uid || !uidMap.has(row.uid)) return row
  return { ...row, uid: uidMap.get(row.uid) }
}

async function listBucketPaths(client, bucket) {
  const paths = []

  async function walk(prefix = '') {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 })
    if (error) {
      if (error.message?.includes('not found')) return
      throw error
    }
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id) paths.push(path)
      else await walk(path)
    }
  }

  await walk()
  return paths
}

async function syncStorageBucket(bucket) {
  const [stagingPaths, prodPaths] = await Promise.all([
    listBucketPaths(staging, bucket),
    listBucketPaths(prod, bucket),
  ])
  const prodSet = new Set(prodPaths)
  const missing = stagingPaths.filter((p) => !prodSet.has(p))

  if (missing.length === 0) {
    console.log(`  ${bucket}: in sync`)
    return
  }

  console.log(`  ${bucket}: ${missing.length} file(s) to copy`)
  if (dryRun) return

  for (const path of missing) {
    const { data: blob, error: dlErr } = await staging.storage.from(bucket).download(path)
    if (dlErr) {
      console.error(`  download failed ${path}: ${dlErr.message}`)
      continue
    }
    const { error: upErr } = await prod.storage.from(bucket).upload(path, blob, {
      upsert: true,
      contentType: blob.type || undefined,
    })
    if (upErr) {
      console.error(`  upload failed ${path}: ${upErr.message}`)
      continue
    }
    console.log(`  copied ${path}`)
  }
}

async function printSummary() {
  console.log('\nRow counts (staging vs production):')
  for (const { table } of TABLE_SYNC_ORDER.slice(0, 12)) {
    const [{ count: s }, { count: p }] = await Promise.all([
      staging.from(table).select('*', { count: 'exact', head: true }),
      prod.from(table).select('*', { count: 'exact', head: true }),
    ])
    if ((s ?? 0) !== (p ?? 0)) console.log(`  ${table}: ${s} → ${p} (delta ${(s ?? 0) - (p ?? 0)})`)
  }
}

async function main() {
  console.log('Staging → Production sync')
  console.log(`  staging: ${stagingUrl}`)
  console.log(`  prod:    ${prodUrl}`)
  console.log(`  mode:    ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  if (since) console.log(`  since:   ${since}`)

  console.log('\nDatabase tables')
  let total = 0
  const uidMap = syncAuth ? await syncAuthUsers() : new Map()

  for (const spec of TABLE_SYNC_ORDER) {
    total += await syncTable(spec, uidMap)
  }
  console.log(`\nTotal rows ${dryRun ? 'would copy' : 'copied'}: ${total}`)

  if (!syncAuth) console.log('\nSkipping auth (--sync-auth to enable)')

  if (syncStorage) {
    console.log('\nStorage')
    for (const bucket of STORAGE_BUCKETS) {
      await syncStorageBucket(bucket)
    }
  } else {
    console.log('\nSkipping storage (--sync-storage to enable)')
  }

  await printSummary()

  console.log('\nAfter live sync, reset sequences on production if you inserted explicit ids:')
  console.log('  Run in SQL editor for each serial table, e.g.:')
  console.log(
    "  SELECT setval(pg_get_serial_sequence('patients','id'), (SELECT COALESCE(MAX(id),1) FROM patients));",
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
