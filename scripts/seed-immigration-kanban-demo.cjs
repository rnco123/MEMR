/**
 * Seeds 10 immigration demo cases across Kanban columns (incomplete → delivered).
 * Run: node scripts/seed-immigration-kanban-demo.cjs
 * Or:  npm run seed:immigration:demo
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
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PROGRAM = 'immigration_i693'
const now = new Date().toISOString()

/** 10 patients — flags align with auto workflow sync on GET /api/i693/cases */
const DEMOS = [
  { n: 1, first: 'Ana', last: 'Rivera', tier: 'no_intake', i693: 'draft' },
  { n: 2, first: 'Ben', last: 'Chen', tier: 'intake_only', i693: 'draft' },
  { n: 3, first: 'Carla', last: 'Okonkwo', tier: 'labs_partial', i693: 'draft' },
  { n: 4, first: 'Diego', last: 'Martinez', tier: 'ready_review', i693: 'ai_filled' },
  { n: 5, first: 'Elena', last: 'Petrov', tier: 'ready_review', i693: 'ai_filled' },
  { n: 6, first: 'Frank', last: 'Nguyen', tier: 'ready_review', i693: 'draft' },
  { n: 7, first: 'Grace', last: 'Williams', tier: 'completed', i693: 'reviewed' },
  { n: 8, first: 'Hassan', last: 'Ali', tier: 'completed', i693: 'exported' },
  { n: 9, first: 'Iris', last: 'Johnson', tier: 'delivered', i693: 'exported' },
  { n: 10, first: 'James', last: 'Park', tier: 'delivered', i693: 'exported' },
]

async function firstId(table, select = 'id') {
  const { data, error } = await admin.from(table).select(select).limit(1).maybeSingle()
  if (error) throw new Error(`${table}: ${error.message}`)
  if (!data) return null
  return data[select.split(',')[0].trim()] ?? data.id
}

function code(n) {
  return `IMM-DEMO-${String(n).padStart(2, '0')}`
}

function baseApplicant(first, last) {
  return {
    family_name: last,
    given_name: first,
    middle_name: '',
    in_care_of: '',
    street: `${100 + first.length} Demo Street`,
    apt: '',
    city: 'Houston',
    state: 'TX',
    zip: '77001',
    province: '',
    postal_code: '',
    country: 'United States',
    date_of_birth: `198${(first.charCodeAt(0) % 9) + 1}-0${(last.length % 8) + 1}-15`,
    country_of_birth: 'Mexico',
    country_of_citizenship: 'Mexico',
    a_number: `A${String(100000000 + first.length * 1111 + last.length).slice(0, 9)}`,
    sex: 'female',
    eligibility_category: 'Adjustment of status',
  }
}

function formForTier(tier, first, last) {
  const applicant = baseApplicant(first, last)
  const labs = {
    tb_screening: {
      quantiferon_t_spot: 'Negative',
      tuberculin_skin_test: '',
      chest_xray: 'Normal',
      classification: 'No active TB',
      treatment: '',
      remarks: '',
    },
    syphilis_sti: {
      syphilis_result: 'Non-reactive',
      gonorrhea_result: 'Negative',
      syphilis_test_type: 'RPR',
      syphilis_date: '2025-01-10',
      gonorrhea_date: '',
      other_sti: '',
      remarks: '',
    },
  }
  const vaccines = [
    {
      vaccine_name: 'MMR',
      date_given: '2015-06-01',
      waiver_reason: '',
      not_medically_appropriate: false,
    },
  ]
  const civilUnsigned = {
    surgeon_name: 'Dr. Demo Civil Surgeon',
    practice_name: 'MEMR Immigration Clinic',
    date_signed: '',
    vaccinations_complete: true,
    vaccination_remarks: 'Record reviewed',
    summary_remarks: 'Pending MD signature',
  }
  const civilSigned = {
    ...civilUnsigned,
    date_signed: '2025-02-01',
    summary_remarks: 'Exam complete — signed',
  }

  if (tier === 'no_intake' || tier === 'intake_only' || tier === 'labs_partial') {
    return { applicant, vaccinations: tier === 'labs_partial' ? [] : [] }
  }
  if (tier === 'ready_review') {
    return { applicant, ...labs, vaccinations: vaccines, civil_surgeon: civilUnsigned }
  }
  if (tier === 'completed' || tier === 'delivered') {
    return { applicant, ...labs, vaccinations: vaccines, civil_surgeon: civilSigned }
  }
  return { applicant }
}

async function upsertPatient(demo, locationId) {
  const patientCode = code(demo.n)
  const { data: existing } = await admin
    .from('patients')
    .select('id')
    .eq('patient_code', patientCode)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data, error } = await admin
    .from('patients')
    .insert({
      first_name: demo.first,
      last_name: demo.last,
      email: `imm.demo.${demo.n}@myclinicmd.test`,
      phone: `+1555000${String(demo.n).padStart(4, '0')}`,
      gender: demo.n % 2 === 0 ? 'male' : 'female',
      date_of_birth: `1985-0${(demo.n % 8) + 1}-12`,
      street_address: `${demo.n}00 Kanban Demo Ln`,
      state: 'TX',
      zip_code: '77002',
      location_id: locationId,
      patient_code: patientCode,
      is_text_opt_in: false,
      is_check_opt_in: true,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function upsertAppointment(patientId, demo, serviceId, locationId, onsiteType) {
  const patientCode = code(demo.n)
  const day = new Date()
  day.setDate(day.getDate() + demo.n)
  const appointmentDate = day.toISOString().slice(0, 10)

  const { data: existing } = await admin
    .from('appointments')
    .select('id')
    .eq('patient_id', patientId)
    .eq('appointment_code', patientCode)
    .maybeSingle()

  if (existing?.id) {
    await admin
      .from('appointments')
      .update({ appointment_date: appointmentDate, appointment_time: `${8 + demo.n}:00:00` })
      .eq('id', existing.id)
    return existing.id
  }

  const row = {
    patient_id: patientId,
    service_id: serviceId,
    appointment_date: appointmentDate,
    appointment_time: `${8 + demo.n}:00:00`,
    onsite_type: onsiteType,
    appointment_code: patientCode,
  }
  if (locationId != null) row.location_id = locationId

  const { data, error } = await admin.from('appointments').insert(row).select('id').single()
  if (error) throw error
  return data.id
}

async function upsertIntake(appointmentId, demo) {
  if (demo.tier === 'no_intake') return null

  const { data: existing } = await admin
    .from('intake_form')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data, error } = await admin
    .from('intake_form')
    .insert({
      appointment_id: appointmentId,
      chief_complaint: `Immigration exam demo #${demo.n}`,
      symptoms_description: 'No acute symptoms.',
      severity: 2,
      medical_conditions: JSON.stringify(['None']),
      allergies: JSON.stringify(['NKDA']),
      current_medications: JSON.stringify(['None']),
      tobacco_use: false,
      alcohol_use: false,
      drug_use: false,
      fh_diabetes: false,
      fh_hypertension: false,
      fh_cancer: false,
      fh_heart_disease: false,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function upsertEncounter(appointmentId, patientId, intakeId, doctorId, demo) {
  const patientCode = code(demo.n)
  const consentAck = {
    immigration: now,
    telemedicine: now,
    hipaa: now,
    ma_supervision: now,
  }

  const { data: existing } = await admin
    .from('encounters')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  const payload = {
    appointment_id: appointmentId,
    patient_id: patientId,
    intake_id: intakeId,
    doctor_id: doctorId,
    status: 'vitals_assessed',
    encounter_code: `ENC-${patientCode}`,
    identity_verified_at: now,
    prescribing_location_ack_at: now,
    ma_supervision_ack_at: now,
    ready_for_doctor_at: now,
    consent_ack: consentAck,
    program_type: PROGRAM,
    ma_exam_findings: `Demo immigration case ${demo.n} — ${demo.tier}`,
    updated_at: now,
  }

  if (existing?.id) {
    await admin.from('encounters').update(payload).eq('id', existing.id)
    return existing.id
  }

  const { data, error } = await admin.from('encounters').insert(payload).select('id').single()
  if (error) throw error
  return data.id
}

async function upsertI693(encounterId, patientId, demo) {
  const form = formForTier(demo.tier, demo.first, demo.last)
  const { error } = await admin.from('i693_submissions').upsert(
    {
      encounter_id: encounterId,
      patient_id: patientId,
      form_data: form,
      status: demo.i693,
      updated_at: now,
    },
    { onConflict: 'encounter_id' }
  )
  if (error) throw error
}

async function upsertImmigrationCase(encounterId, patientId, demo) {
  const statusMap = {
    no_intake: 'incomplete',
    intake_only: 'incomplete',
    labs_partial: 'incomplete',
    ready_review: 'ready_review',
    completed: 'completed',
    delivered: 'delivered',
  }
  const colorMap = {
    incomplete: 'red',
    ready_review: 'yellow',
    completed: 'green',
    delivered: 'blue',
  }
  const status = statusMap[demo.tier]
  const status_color = colorMap[status]
  const is_delivered = demo.tier === 'delivered'
  const is_md_signed = demo.tier === 'completed' || demo.tier === 'delivered'
  const is_intake_complete = demo.tier !== 'no_intake'
  const is_lab_complete = ['ready_review', 'completed', 'delivered'].includes(demo.tier)
  const is_vaccine_complete = ['ready_review', 'completed', 'delivered'].includes(demo.tier)

  const missing = []
  if (!is_intake_complete) missing.push('intake')
  if (!is_lab_complete) missing.push('tb_lab')
  if (!is_vaccine_complete) missing.push('vaccine_record')
  if (status === 'ready_review') missing.push('md_signature')

  const { error } = await admin.from('immigration_cases').upsert(
    {
      patient_id: patientId,
      encounter_id: encounterId,
      status,
      status_color,
      missing_items: missing,
      is_lab_complete,
      is_vaccine_complete,
      is_intake_complete,
      is_md_signed,
      is_delivered,
      updated_at: now,
    },
    { onConflict: 'encounter_id' }
  )
  if (error) throw error
}

async function main() {
  console.log('Seeding 10 immigration Kanban demo cases…\n')

  const serviceId = await firstId('services')
  if (!serviceId) {
    console.error('No services row — add at least one service in Supabase.')
    process.exit(1)
  }

  const locationId = await firstId('locations')
  const doctorId = await firstId('doctors')

  let onsiteType = 'onsite'
  const { data: sampleAppt } = await admin.from('appointments').select('onsite_type').limit(1).maybeSingle()
  if (sampleAppt?.onsite_type) onsiteType = sampleAppt.onsite_type

  const created = []

  for (const demo of DEMOS) {
    const patientId = await upsertPatient(demo, locationId)
    const appointmentId = await upsertAppointment(patientId, demo, serviceId, locationId, onsiteType)
    const intakeId = await upsertIntake(appointmentId, demo)
    const encounterId = await upsertEncounter(appointmentId, patientId, intakeId, doctorId, demo)
    await upsertI693(encounterId, patientId, demo)
    await upsertImmigrationCase(encounterId, patientId, demo)
    created.push({
      code: code(demo.n),
      name: `${demo.first} ${demo.last}`,
      encounterId,
      tier: demo.tier,
    })
    console.log(`  ${code(demo.n)}  ${demo.first} ${demo.last}  encounter ${encounterId}  → ${demo.tier}`)
  }

  console.log('\n--- 10 demo cases ready ---')
  console.log('Kanban: http://localhost:3000/dashboard/i-693')
  console.log('\nBy column (after refresh):')
  console.log('  Incomplete: IMM-DEMO-01, 02, 03')
  console.log('  Ready for MD: IMM-DEMO-04, 05, 06')
  console.log('  Completed: IMM-DEMO-07, 08')
  console.log('  Delivered: IMM-DEMO-09, 10')
  console.log('\nFirst encounter:', created[0].encounterId)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
