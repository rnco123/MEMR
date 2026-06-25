/**
 * Seeds encounter_physician_reviews from real encounters assigned to FNP/PA in doctors table.
 * Uses actual encounter.doctor_id → doctors.user_id (not artificial alternation).
 *
 * Run:  npm run seed:compliance
 * Resync existing rows: npm run seed:compliance -- --resync
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

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const resync = process.argv.includes('--resync')

const COMPLETE_STATUSES = ['reviewed', 'consult_concluded', 'physician_signed']

function reviewStatusForEncounter(encounterStatus, encounterId) {
  if (encounterStatus === 'completed') {
    return COMPLETE_STATUSES[encounterId % COMPLETE_STATUSES.length]
  }
  return 'pending'
}

function reviewedAtFor(encounter) {
  if (reviewStatusForEncounter(encounter.status, encounter.id) === 'pending') return null
  return encounter.updated_at
}

async function loadRoleByUserId() {
  const { data, error } = await admin.from('profiles').select('id, uid, role, full_name')
  if (error) throw error
  const map = new Map()
  for (const row of data ?? []) {
    if (row.id) map.set(row.id, row)
    if (row.uid) map.set(row.uid, row)
  }
  return map
}

async function loadSupervisingPhysicians(roleByUser) {
  const mds = []
  for (const [, profile] of roleByUser) {
    if (profile.role === 'doctor' && profile.full_name?.trim()) {
      const uid = profile.uid || profile.id
      if (uid && !profile.full_name.match(/^doctor$/i)) {
        mds.push({ uid, name: profile.full_name.trim() })
      }
    }
  }
  if (mds.length === 0) {
    throw new Error('Need at least one MD profile (e.g. Peterson, Dallas) for reviewed rows')
  }
  return mds
}

async function loadAuditableEncounters() {
  const { data, error } = await admin
    .from('encounters')
    .select(`
      id,
      patient_id,
      encounter_code,
      status,
      updated_at,
      documenting_user_id,
      doctor_id,
      doctors!inner ( user_id, full_name ),
      patients!inner ( first_name, last_name )
    `)
    .not('patient_id', 'is', null)
    .not('doctor_id', 'is', null)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

async function main() {
  console.log('Seeding compliance reviews from real FNP/PA encounter assignments…')
  if (resync) console.log('  (--resync: replacing existing review rows)')

  const roleByUser = await loadRoleByUserId()
  const supervisingMds = await loadSupervisingPhysicians(roleByUser)

  console.log(`  Supervising MDs: ${supervisingMds.map(m => m.name).join(', ')}`)

  const encounters = await loadAuditableEncounters()
  const eligible = encounters.filter(enc => {
    const doctor = Array.isArray(enc.doctors) ? enc.doctors[0] : enc.doctors
    const uid = doctor?.user_id
    if (!uid) return false
    const role = roleByUser.get(uid)?.role
    return role === 'fnp' || role === 'pa'
  })

  if (eligible.length === 0) {
    console.error('No encounters assigned to FNP/PA providers found')
    process.exit(1)
  }

  const fnpPaNames = [...new Set(eligible.map(enc => {
    const doctor = Array.isArray(enc.doctors) ? enc.doctors[0] : enc.doctors
    return doctor?.full_name?.trim()
  }).filter(Boolean))]
  console.log(`  Documenting providers: ${fnpPaNames.join(', ')}`)
  console.log(`  Eligible encounters: ${eligible.length}`)

  if (resync) {
    const { error: delErr } = await admin
      .from('encounter_physician_reviews')
      .delete()
      .neq('id', 0)
    if (delErr) throw delErr
    console.log('  Cleared existing encounter_physician_reviews rows')
  }

  const { data: existingReviews, error: existingErr } = await admin
    .from('encounter_physician_reviews')
    .select('encounter_id')

  if (existingErr) throw existingErr
  const already = new Set((existingReviews ?? []).map(r => r.encounter_id))

  let inserted = 0
  let updatedEncounters = 0
  let skipped = 0

  for (let i = 0; i < eligible.length; i++) {
    const enc = eligible[i]
    if (!resync && already.has(enc.id)) {
      skipped++
      continue
    }

    const doctor = Array.isArray(enc.doctors) ? enc.doctors[0] : enc.doctors
    const documentingUserId = doctor.user_id
    const providerName = doctor.full_name?.trim() || roleByUser.get(documentingUserId)?.full_name || 'Unknown'
    const reviewStatus = reviewStatusForEncounter(enc.status, enc.id)
    const isComplete = reviewStatus !== 'pending'
    const reviewedAt = reviewedAtFor(enc)
    const supervisingMd = supervisingMds[i % supervisingMds.length]

    if (enc.documenting_user_id !== documentingUserId) {
      const { error: encUpdErr } = await admin
        .from('encounters')
        .update({ documenting_user_id: documentingUserId })
        .eq('id', enc.id)
      if (encUpdErr) throw encUpdErr
      updatedEncounters++
    }

    const row = {
      encounter_id: enc.id,
      patient_id: enc.patient_id,
      documenting_user_id: documentingUserId,
      review_status: reviewStatus,
      reviewed_by_user_id: isComplete ? supervisingMd.uid : null,
      reviewed_at: reviewedAt,
      notes: null,
      findings: null,
      created_at: enc.updated_at,
      updated_at: reviewedAt ?? enc.updated_at,
    }

    const { error: insErr } = await admin.from('encounter_physician_reviews').insert(row)
    if (insErr) {
      console.warn(`  Skip encounter ${enc.id}: ${insErr.message}`)
      continue
    }

    const pat = enc.patients
    const patientName = pat
      ? `${pat.first_name ?? ''} ${pat.last_name ?? ''}`.trim()
      : `patient ${enc.patient_id}`

    const mdNote = isComplete ? ` — reviewed by ${supervisingMd.name}` : ''
    console.log(
      `  + ${enc.encounter_code ?? enc.id} — ${patientName} — ${providerName} — ${reviewStatus}${mdNote}`
    )
    inserted++
  }

  console.log('')
  console.log(`Done: ${inserted} review row(s), ${updatedEncounters} encounter(s) tagged with documenting_user_id.`)
  if (skipped) console.log(`Skipped ${skipped} encounter(s) that already had review rows (use --resync to replace).`)
  console.log('Open /admin/compliance to view the dashboard.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
