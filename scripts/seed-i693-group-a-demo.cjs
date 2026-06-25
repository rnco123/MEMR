/**
 * Creates one Group A (Dallas) immigration demo patient for I-693 auto-fill testing.
 * Run: node scripts/seed-i693-group-a-demo.cjs
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

const PATIENT_CODE = 'IMM-GRP-A-DEMO'
const PROGRAM = 'immigration_i693'
const IMMIGRATION_SERVICE_ID = 25
const GROUP_A_LOCATION_ID = 6 // Clinica San Miguel Garland (Dallas, Group A)

const now = new Date().toISOString()
const today = new Date().toISOString().slice(0, 10)

async function main() {
  const { data: location, error: locErr } = await admin
    .from('locations')
    .select('id, title, address, location_group')
    .eq('id', GROUP_A_LOCATION_ID)
    .maybeSingle()

  if (locErr || !location) throw new Error('Group A location not found')
  if (location.location_group !== 'A') {
    throw new Error(`Location ${location.id} is not Group A (${location.location_group})`)
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
    .eq('patient_code', PATIENT_CODE)
    .maybeSingle()

  if (existingPatient?.id) {
    patientId = existingPatient.id
    await admin
      .from('patients')
      .update({
        location_id: location.id,
        first_name: 'Demo',
        last_name: 'GroupA I693',
        email: 'imm.grp-a.demo@myclinicmd.test',
        phone: '+15559876543',
        gender: 'female',
        date_of_birth: '1992-03-20',
        street_address: '500 Demo Blvd',
        state: 'TX',
        zip_code: '75218',
      })
      .eq('id', patientId)
    console.log('Reusing patient id:', patientId)
  } else {
    const { data: patient, error: pErr } = await admin
      .from('patients')
      .insert({
        first_name: 'Demo',
        last_name: 'GroupA I693',
        email: 'imm.grp-a.demo@myclinicmd.test',
        phone: '+15559876543',
        gender: 'female',
        date_of_birth: '1992-03-20',
        street_address: '500 Demo Blvd',
        state: 'TX',
        zip_code: '75218',
        location_id: location.id,
        patient_code: PATIENT_CODE,
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
    .eq('appointment_code', PATIENT_CODE)
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
        appointment_time: '09:00:00',
        onsite_type: 'onsite',
        appointment_code: PATIENT_CODE,
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
        appointment_time: '09:00:00',
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
          family_name: 'GroupA I693',
          given_name: 'Demo',
          middle_name: '',
          street: '500 Demo Blvd',
          city: 'Dallas',
          state: 'TX',
          zip: '75218',
          country: 'United States',
          date_of_birth: '1992-03-20',
          country_of_birth: 'Mexico',
          country_of_citizenship: 'Mexico',
          a_number: 'A987654321',
          sex: 'female',
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

  console.log('\n--- Group A I-693 demo ready ---')
  console.log('Patient code:', PATIENT_CODE)
  console.log('Patient:', 'Demo GroupA I693', `(id ${patientId})`)
  console.log('Location:', location.title, `— ${location.address}`)
  console.log('Location group:', location.location_group, '(Dallas auto-fill)')
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
