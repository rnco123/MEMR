import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const { searchParams } = new URL(request.url)
  const doctorUserId = searchParams.get('doctor_id') // This is user_id (UUID)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore if called from Server Component
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (doctorUserId) {
    // First, get the doctor record by user_id
    const { data: doctorData, error: doctorError } = await supabase
      .from('doctors')
      .select('id')
      .eq('user_id', doctorUserId)
      .single()

    if (doctorError || !doctorData) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
    }

    // Get specific doctor's availability using doctor.id (BIGINT)
    const { data, error } = await supabase
      .from('doctor_availability')
      .select('*')
      .eq('doctor_id', doctorData.id)
      .single()

    if (error) {
      // If record doesn't exist, return default availability (false)
      if (error.code === 'PGRST116') {
        return NextResponse.json({ data: { doctor_id: doctorData.id, is_available: false, updated_at: null } })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  }

  // Get all available doctors
  const { data, error } = await supabase
    .from('doctor_availability')
    .select('doctor_id, is_available, updated_at')
    .eq('is_available', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore if called from Server Component
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { is_available } = await request.json()

  // Get user profile to get name and email
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('uid', user.id)
    .single()

  const doctorEmail = profile?.email || user.email || ''
  const doctorName = profile?.full_name || user.email || 'Doctor'

  // First, ensure the doctor exists in the doctors table
  // Check if doctor record exists by user_id
  const { data: existingDoctor } = await supabase
    .from('doctors')
    .select('id, user_id, email, full_name')
    .eq('user_id', user.id)
    .single()

  let doctorId: number

  // If doctor doesn't exist, create it
  if (!existingDoctor) {
    const { data: newDoctor, error: createDoctorError } = await supabase
      .from('doctors')
      .insert({
        user_id: user.id,
        full_name: doctorName,
        email: doctorEmail,
      })
      .select('id')
      .single()

    if (createDoctorError || !newDoctor) {
      return NextResponse.json(
        { error: 'Failed to create doctor record. Please ensure your profile is set up.' },
        { status: 400 }
      )
    }

    doctorId = newDoctor.id
  } else {
    doctorId = existingDoctor.id
  }

  // Now update or insert availability
  const { data: existingAvailability } = await supabase
    .from('doctor_availability')
    .select('id')
    .eq('doctor_id', doctorId)
    .single()

  if (existingAvailability) {
    // Update existing availability
    const { error: updateError } = await supabase
      .from('doctor_availability')
      .update({ 
        is_available,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingAvailability.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  } else {
    // Create new availability record
    const { error: insertError } = await supabase
      .from('doctor_availability')
      .insert({
        doctor_id: doctorId,
        is_available,
      })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ 
    success: true, 
    data: { doctor_id: doctorId, is_available } 
  })
}
