/**
 * Create or update an admin user (auth + profiles).
 * Usage: node scripts/create-admin-user.cjs "Full Name" email@example.com 'Password'
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    const val = t.slice(i + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY

const [fullName, email, password] = process.argv.slice(2)

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env')
  process.exit(1)
}

if (!fullName || !email || !password) {
  console.error('Usage: node scripts/create-admin-user.cjs "Full Name" email@example.com \'Password\'')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const normalizedEmail = email.trim().toLowerCase()
  const name = fullName.trim()

  let uid = null

  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (listErr) throw new Error(listErr.message)

  const existing = listData.users.find(
    (u) => (u.email || '').toLowerCase() === normalizedEmail
  )

  if (existing) {
    uid = existing.id
    const { error: updateErr } = await admin.auth.admin.updateUserById(uid, {
      password,
      email_confirm: true,
      user_metadata: { name, full_name: name, role: 'admin' },
    })
    if (updateErr) throw new Error(updateErr.message)
    console.log('Updated existing auth user:', normalizedEmail)
  } else {
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { name, full_name: name, role: 'admin' },
    })
    if (authErr) throw new Error(authErr.message)
    uid = authData.user.id
    console.log('Created auth user:', normalizedEmail)
  }

  const profileRow = {
    uid,
    id: uid,
    role: 'admin',
    full_name: name,
    email: normalizedEmail,
    active: true,
  }

  const { data: profile } = await admin.from('profiles').select('uid').eq('uid', uid).maybeSingle()

  if (profile) {
    const { error: profileErr } = await admin.from('profiles').update(profileRow).eq('uid', uid)
    if (profileErr) throw new Error(`Profile update: ${profileErr.message}`)
    console.log('Updated profiles row (role=admin)')
  } else {
    const { error: profileErr } = await admin.from('profiles').insert(profileRow)
    if (profileErr) throw new Error(`Profile insert: ${profileErr.message}`)
    console.log('Inserted profiles row (role=admin)')
  }

  console.log('Done. UID:', uid)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
