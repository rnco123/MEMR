/**
 * Creates a test patient ("I693 Patient") with a today appointment + encounter
 * in a Clinica group A/B/C location so the I-693 location auto-fill can be tested.
 *
 * Run: node scripts/seed-i693-test-patient.cjs
 *
 * Requires in .env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (or SERVICE_ROLE_KEY)
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

const SAMPLE_CODE = 'I693-TEST-001'
const now = new Date().toISOString()
const today = new Date().toISOString().slice(0, 10)

async function firstId(table, select = 'id') {
  const { data, error } = await admin.from(table).select(select).limit(1).maybeSingle()
  if (error) throw new Error(`${table}: ${error.message}`)
  if (!data) return null
  return data[select.split(',')[0].trim()] ?? data.id
}

/** Pick a location assigned to Clinica group A, B, or C (required for I-693 auto-fill). */
async function findGroupLocation() {
  const { data, error } = await admin
    .from('locations')
    .select('id, title, address, location_group')
    .in('location_group', ['A', 'B', 'C'])
    .order('location_group', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`locations: ${error.message}`)
  return data || null
}

async function main() {
  console.log('Seeding I-693 test patient…')

  const location = await findGroupLocation()
  if (!location) {
    console.error(
      'No location is assigned to group A, B, or C. Assign a location_group (A/B/C) in the locations table first.'
    )
    process.exit(1)
  }
  console.log(`Using location #${location.id} "${location.title}" (group ${location.location_group})`)

  const { data: existingPatient } = await admin
    .from('patients')
    .select('id')
    .eq('patient_code', SAMPLE_CODE)
    .maybeSingle()

  let patientId = existingPatient?.id

  if (!patientId) {
    const { data: patient, error: pErr } = await admin
      .from('patients')
      .insert({
        first_name: 'I693',
        last_name: 'Patient',
        email: 'i693.patient@myclinicmd.test',
        phone: '+15550123693',
        gender: 'female',
        date_of_birth: '1992-04-10',
        street_address: '123 Main Street',
        state: 'TX',
        zip_code: '75001',
        location_id: location.id,
        patient_code: SAMPLE_CODE,
        is_text_opt_in: false,
        is_check_opt_in: true,
      })
      .select('id')
      .single()
    if (pErr) throw pErr
    patientId = patient.id
    console.log('Created patient id:', patientId)
  } else {
    await admin.from('patients').update({ location_id: location.id }).eq('id', patientId)
    console.log('Reusing patient id:', patientId, '(location synced)')
  }

  const serviceId = await firstId('services')
  if (!serviceId) {
    console.error('No row in services table — add at least one service in Supabase first.')
    process.exit(1)
  }

  let onsiteType = 'onsite'
  const { data: sampleAppt } = await admin
    .from('appointments')
    .select('onsite_type')
    .limit(1)
    .maybeSingle()
  if (sampleAppt?.onsite_type) onsiteType = sampleAppt.onsite_type

  const { data: existingAppt } = await admin
    .from('appointments')
    .select('id')
    .eq('patient_id', patientId)
    .eq('appointment_code', SAMPLE_CODE)
    .maybeSingle()

  let appointmentId = existingAppt?.id

  if (!appointmentId) {
    const { data: appt, error: aErr } = await admin
      .from('appointments')
      .insert({
        patient_id: patientId,
        service_id: serviceId,
        appointment_date: today,
        appointment_time: '10:30:00',
        onsite_type: onsiteType,
        location_id: location.id,
        appointment_code: SAMPLE_CODE,
      })
      .select('id')
      .single()
    if (aErr) throw aErr
    appointmentId = appt.id
    console.log('Created appointment id:', appointmentId)
  } else {
    await admin
      .from('appointments')
      .update({ appointment_date: today, location_id: location.id })
      .eq('id', appointmentId)
    console.log('Reusing appointment id:', appointmentId, '(date/location synced)')
  }

  let intakeId = null
  const { data: existingIntake } = await admin
    .from('intake_form')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  if (existingIntake?.id) {
    intakeId = existingIntake.id
    console.log('Reusing intake id:', intakeId)
  } else {
    const { data: intake, error: iErr } = await admin
      .from('intake_form')
      .insert({
        appointment_id: appointmentId,
        chief_complaint: 'Immigration medical examination (I-693)',
        symptoms_description: 'No acute symptoms. Visit for civil surgeon exam.',
        severity: 2,
        medical_conditions: JSON.stringify(['None reported']),
        allergies: JSON.stringify(['NKDA']),
        current_medications: JSON.stringify(['None']),
        tobacco_use: false,
        alcohol_use: false,
        drug_use: false,
      })
      .select('id')
      .single()
    if (iErr) throw iErr
    intakeId = intake.id
    console.log('Created intake id:', intakeId)
  }

  const doctorId = await firstId('doctors')

  const consentAck = {
    immigration: now,
    telemedicine: now,
    hipaa: now,
    ma_supervision: now,
  }

  const { data: existingEnc } = await admin
    .from('encounters')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  let encounterId = existingEnc?.id

  if (!encounterId) {
    const { data: enc, error: eErr } = await admin
      .from('encounters')
      .insert({
        appointment_id: appointmentId,
        patient_id: patientId,
        intake_id: intakeId,
        doctor_id: doctorId,
        status: 'in_consultation',
        encounter_code: `ENC-${SAMPLE_CODE}`,
        identity_verified_at: now,
        prescribing_location_ack_at: now,
        ma_supervision_ack_at: now,
        ready_for_doctor_at: now,
        consent_ack: consentAck,
        ma_exam_findings:
          'Patient presents for immigration exam. Vitals stable. No acute distress.',
        updated_at: now,
      })
      .select('id')
      .single()
    if (eErr) throw eErr
    encounterId = enc.id
    console.log('Created encounter id:', encounterId)
  } else {
    await admin
      .from('encounters')
      .update({
        consent_ack: consentAck,
        status: 'in_consultation',
        intake_id: intakeId,
        doctor_id: doctorId,
        updated_at: now,
      })
      .eq('id', encounterId)
    console.log('Updated encounter id:', encounterId)
  }

  const { data: existingVitals } = await admin
    .from('vitals')
    .select('id')
    .eq('encounter_id', encounterId)
    .maybeSingle()

  if (!existingVitals) {
    const { error: vErr } = await admin.from('vitals').insert({
      encounter_id: encounterId,
      bp_systolic: 118,
      bp_diastolic: 76,
      heart_rate: 72,
      respiratory_rate: 16,
      temperature: 98.4,
      temperature_unit: 'F',
      spo2: 98,
      weight: 145,
      weight_unit: 'lbs',
      height: 64,
      height_unit: 'in',
      bmi: 24.9,
      notes: 'Sample vitals for I-693 test',
    })
    if (vErr) console.warn('Vitals insert:', vErr.message)
    else console.log('Created vitals for encounter', encounterId)
  }

  // Minimal draft so the I-693 editor opens; leave the rest for location auto-fill.
  const draftForm = {
    applicant: {
      family_name: 'Patient',
      given_name: 'I693',
      date_of_birth: '1992-04-10',
      sex: 'female',
    },
  }

  const { error: i693Err } = await admin.from('i693_submissions').upsert(
    {
      encounter_id: encounterId,
      patient_id: patientId,
      form_data: draftForm,
      status: 'draft',
      updated_at: now,
    },
    { onConflict: 'encounter_id' }
  )

  if (i693Err) {
    if (i693Err.message.includes('i693_submissions')) {
      console.warn('i693_submissions table missing — run migration 044_i693_submissions.sql first.')
    } else {
      console.warn('I-693 draft:', i693Err.message)
    }
  } else {
    console.log('Upserted i693_submissions draft')
  }

  console.log('\n--- I-693 test patient ready ---')
  console.log('Name:           I693 Patient')
  console.log('Patient code:   ', SAMPLE_CODE)
  console.log('Patient id:     ', patientId)
  console.log('Location:       ', `#${location.id} ${location.title} (group ${location.location_group})`)
  console.log('Appointment id: ', appointmentId)
  console.log('Encounter id:   ', encounterId)
  console.log('\nOpen the encounter, open the I-693 editor, then use "Auto-fill from location".')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
