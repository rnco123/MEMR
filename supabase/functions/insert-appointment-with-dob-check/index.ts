import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const apiKey = Deno.env.get('X_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    const { location_id, service_id, onsite_type } = appointment

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: existingPatient, error: checkError } = await supabase
      .from('patients')
      .select('id')
      .eq('phone', phone)
      .eq('date_of_birth', date_of_birth)
      .maybeSingle()

    if (checkError) throw checkError

    let patient_id = existingPatient?.id

    if (!patient_id) {
      const { data: newPatient, error } = await supabase
        .from('patients')
        .insert({
          first_name,
          last_name,
          email,
          phone,
          gender,
          date_of_birth,
          street_address,
          state,
          zip_code: zipcode,
          location_id,
          is_text_opt_in,
          is_check_opt_in,
        })
        .select('id')
        .single()

      if (error) throw error
      patient_id = newPatient.id
    }

    const { data: newAppointment, error: apptError } = await supabase
      .from('appointments')
      .insert({
        patient_id,
        location_id,
        service_id,
        onsite_type,
      })
      .select('id')
      .single()

    if (apptError) throw apptError

    return new Response(
      JSON.stringify({
        status: 'success',
        appointment_id: newAppointment.id,
        patient_id,
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
