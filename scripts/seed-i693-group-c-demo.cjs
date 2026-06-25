/**
 * Creates one Group C (San Antonio) immigration demo patient for I-693 auto-fill testing.
 * Run: node scripts/seed-i693-group-c-demo.cjs
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
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

const DEMO_EMAIL = 'imm.grp-c.demo@myclinicmd.test'
const APPOINTMENT_CODE = 'IMM-GRP-C-DEMO'
const PROGRAM = 'immigration_i693'
const IMMIGRATION_SERVICE_ID = 25
const GROUP_C_LOCATION_ID = 18 // Clinica San Miguel SW Military (San Antonio, Group C)

const now = new Date().toISOString()
const today = new Date().toISOString().slice(0, 10)

async function main() {
  const { data: location, error: locErr } = await admin
    .from('locations')
    .select('id, title, address, location_group')
    .eq('id', GROUP_C_LOCATION_ID)
    .maybeSingle()

  if (locErr || !location) throw new Error('Group C location not found')
  if (location.location_group !== 'C') {
    throw new Error(`Location ${location.id} is not Group C (${location.location_group})`)
  }

  const { data: service, error: svcErr } = await admin
    .from('services')
    .select('id, title_en')
    .eq('id', IMMIGRATION_SERVICE_ID)
    .maybeSingle()

  if (svcErr || !service) throw new Error('Immigration service not found')

  let patientId
  const { data: existingPatient } = await admin
    .from('patients')
    .select('id')
    .eq('email', DEMO_EMAIL)
    .maybeSingle()

  if (existingPatient?.id) {
    patientId = existingPatient.id
    await admin
      .from('patients')
      .update({
        location_id: location.id,
        first_name: 'Demo',
        last_name: 'GroupC I693',
        phone: '+15559876544',
        gender: 'male',
        date_of_birth: '1988-07-14',
        street_address: '680 SW Military Dr',
        state: 'TX',
        zip_code: '78221',
      })
      .eq('id', patientId)
    console.log('Reusing patient id:', patientId)
  } else {
    const { data: patient, error: pErr } = await admin
      .from('patients')
      .insert({
        first_name: 'Demo',
        last_name: 'GroupC I693',
        email: DEMO_EMAIL,
        phone: '+15559876544',
        gender: 'male',
        date_of_birth: '1988-07-14',
        street_address: '680 SW Military Dr',
        state: 'TX',
        zip_code: '78221',
        location_id: location.id,
        is_text_opt_in: false,
        is_check_opt_in: true,
      })
      .select('id')
      .single()
    if (pErr) throw pErr
    patientId = patient.id
    console.log('Created patient id:', patientId)
  }

  const { data: existingAppt } = await admin
    .from('appointments')
    .select('id')
    .eq('patient_id', patientId)
    .eq('appointment_code', APPOINTMENT_CODE)
    .maybeSingle()

  let appointmentId = existingAppt?.id

  if (!appointmentId) {
    const { data: appt, error: aErr } = await admin
      .from('appointments')
      .insert({
        patient_id: patientId,
        service_id: service.id,
        location_id: location.id,
        appointment_date: today,
        appointment_time: '10:00:00',
        onsite_type: 'onsite',
        appointment_code: APPOINTMENT_CODE,
      })
      .select('id')
      .single()
    if (aErr) throw aErr
    appointmentId = appt.id
    console.log('Created appointment id:', appointmentId)
  } else {
    await admin
      .from('appointments')
      .update({
        appointment_date: today,
        appointment_time: '10:00:00',
        service_id: service.id,
        location_id: location.id,
      })
      .eq('id', appointmentId)
    console.log('Reusing appointment id:', appointmentId)
  }

  const { data: existingEnc } = await admin
    .from('encounters')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  let encounterId = existingEnc?.id

  const encounterPayload = {
    appointment_id: appointmentId,
    patient_id: patientId,
    intake_id: null,
    status: 'appointment_initiated',
    program_type: PROGRAM,
    consent_ack: { immigration: now },
    updated_at: now,
  }

  if (!encounterId) {
    const { data: enc, error: eErr } = await admin
      .from('encounters')
      .insert(encounterPayload)
      .select('id')
      .single()
    if (eErr) throw eErr
    encounterId = enc.id
    console.log('Created encounter id:', encounterId)
  } else {
    await admin.from('encounters').update(encounterPayload).eq('id', encounterId)
    console.log('Updated encounter id:', encounterId)
  }

  const { error: i693Err } = await admin.from('i693_submissions').upsert(
    {
      encounter_id: encounterId,
      patient_id: patientId,
      form_data: {
        applicant: {
          family_name: 'GroupC I693',
          given_name: 'Demo',
          middle_name: '',
          street: '680 SW Military Dr',
          city: 'San Antonio',
          state: 'TX',
          zip: '78221',
          country: 'United States',
          date_of_birth: '1988-07-14',
          country_of_birth: 'Mexico',
          country_of_citizenship: 'Mexico',
          a_number: 'A876543210',
          sex: 'male',
          eligibility_category: 'Adjustment of status',
        },
      },
      status: 'draft',
      updated_at: now,
    },
    { onConflict: 'encounter_id' }
  )
  if (i693Err) throw i693Err

  const { error: caseErr } = await admin.from('immigration_cases').upsert(
    {
      patient_id: patientId,
      encounter_id: encounterId,
      status: 'incomplete',
      status_color: 'red',
      missing_items: ['intake', 'tb_lab', 'vaccine_record'],
      is_lab_complete: false,
      is_vaccine_complete: false,
      is_intake_complete: false,
      is_md_signed: false,
      is_delivered: false,
      updated_at: now,
    },
    { onConflict: 'encounter_id' }
  )
  if (caseErr) throw caseErr

  const { data: patientRow } = await admin
    .from('patients')
    .select('patient_code')
    .eq('id', patientId)
    .single()

  console.log('\n--- Group C I-693 demo ready ---')
  console.log('Patient code:', patientRow?.patient_code ?? '(system-generated)')
  console.log('Patient:', 'Demo GroupC I693', `(id ${patientId})`)
  console.log('Location:', location.title, `— ${location.address}`)
  console.log('Location group:', location.location_group, '(San Antonio auto-fill)')
  console.log('Service:', service.title_en, `(id ${service.id})`)
  console.log('Appointment id:', appointmentId)
  console.log('Encounter id:', encounterId, '— status: appointment_initiated')
  console.log('\nOpen I-693 board: http://localhost:3000/dashboard/i-693')
  console.log('PDF editor: http://localhost:3000/dashboard/i-693?encounter=' + encounterId)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
