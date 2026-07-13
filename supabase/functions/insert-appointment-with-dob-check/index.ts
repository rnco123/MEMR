import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const apiKey = Deno.env.get('X_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function phoneMatchDigits(value: string | null | undefined): string {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  if (digits.length > 10) return digits.slice(-10)
  return digits
}

function normalizePhoneForStorage(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length > 0) return `+${digits}`
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const incomingApiKey = req.headers.get('X-API-KEY')
    if (!apiKey || incomingApiKey !== apiKey) {
      return new Response('Unauthorized', { status: 403, headers: corsHeaders })
    }

    const body = await req.json()
    const { patient, appointment } = body

    const {
      first_name,
      last_name,
      email,
      phone,
      gender,
      date_of_birth,
      street_address,
      state,
      zipcode,
      is_text_opt_in,
      is_check_opt_in,
    } = patient

    const { location_id, service_id, onsite_type, appointment_date, appointment_time } = appointment

    if (!phone || !date_of_birth) {
      return new Response(
        JSON.stringify({ status: 'error', message: 'phone and date_of_birth are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const storedPhone = normalizePhoneForStorage(phone)
    const inputPhoneDigits = phoneMatchDigits(phone)

    // Match returning patients by DOB + phone (digits), not exact string — avoids duplicate charts.
    const { data: dobMatches, error: checkError } = await supabase
      .from('patients')
      .select('id, phone')
      .eq('date_of_birth', date_of_birth)

    if (checkError) throw checkError

    const existingRow = (dobMatches ?? []).find(
      (row) => phoneMatchDigits(row.phone) === inputPhoneDigits && inputPhoneDigits.length >= 10,
    )

    let patient_id = existingRow?.id
    const existing_patient = Boolean(patient_id)

    if (patient_id) {
      const { error: updateError } = await supabase
        .from('patients')
        .update({
          first_name,
          last_name,
          email,
          phone: storedPhone ?? phone,
          gender,
          street_address,
          state,
          zip_code: zipcode,
          location_id,
          is_text_opt_in,
          is_check_opt_in,
        })
        .eq('id', patient_id)

      if (updateError) throw updateError
    } else {
      const { data: newPatient, error } = await supabase
        .from('patients')
        .insert({
          first_name,
          last_name,
          email,
          phone: storedPhone ?? phone,
          gender,
          date_of_birth,
          street_address,
          state,
          zip_code: zipcode,
          location_id,
          is_text_opt_in,
          is_check_opt_in,
          // Existing QR registration path — keep EMR ↔ QR sync behavior unchanged.
          created_by_source: 'QR',
        })
        .select('id')
        .single()

      if (error) throw error
      patient_id = newPatient.id
    }

    const appointmentRow: Record<string, unknown> = {
      patient_id,
      location_id,
      service_id,
      onsite_type,
    }
    if (appointment_date) appointmentRow.appointment_date = appointment_date
    if (appointment_time) appointmentRow.appointment_time = appointment_time

    const { data: newAppointment, error: apptError } = await supabase
      .from('appointments')
      .insert(appointmentRow)
      .select('id')
      .single()

    if (apptError) throw apptError

    return new Response(
      JSON.stringify({
        status: 'success',
        appointment_id: newAppointment.id,
        patient_id,
        existing_patient,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Create appointment error:', message)
    return new Response(JSON.stringify({ status: 'error', message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
