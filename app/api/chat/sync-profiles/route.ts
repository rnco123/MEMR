import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

// This endpoint helps sync existing users to the profiles table for chat
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin/doctor (you can adjust this permission check)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('uid', user.id)
      .single()

    if (!profile || profile.role !== 'doctor') {
      return NextResponse.json({ error: 'Only doctors can sync profiles' }, { status: 403 })
    }

    // Use admin client to sync profiles
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get all auth users
    const { data: { users: authUsers }, error: usersError } = await supabaseAdmin.auth.admin.listUsers()

    if (usersError) {
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Get existing profiles
    const { data: existingProfiles } = await supabaseAdmin
      .from('profiles')
      .select('uid')

    const existingUids = new Set(existingProfiles?.map(p => p.uid) || [])

    // Get doctors and nurses to get their names
    const { data: doctors } = await supabaseAdmin.from('doctors').select('user_id, first_name, last_name, email')
    const { data: nurses } = await supabaseAdmin.from('nurses').select('user_id, first_name, last_name, email')

    const doctorsMap = new Map(doctors?.map(d => [d.user_id, d]) || [])
    const nursesMap = new Map(nurses?.map(n => [n.user_id, n]) || [])

    let created = 0
    let errors = 0

    // Create profiles for users that don't have them
    for (const authUser of authUsers) {
      if (existingUids.has(authUser.id)) {
        continue // Profile already exists
      }

      // Determine role from metadata or from doctors/nurses tables
      let role = authUser.user_metadata?.role || 'staff'
      let fullName = authUser.user_metadata?.name || authUser.user_metadata?.full_name || ''
      let email = authUser.email || ''

      // Check if user is in doctors table
      const doctor = doctorsMap.get(authUser.id)
      if (doctor) {
        role = 'doctor'
        fullName = `${doctor.first_name} ${doctor.last_name}`.trim() || fullName
        email = doctor.email || email
      } else {
        // Check if user is in nurses table
        const nurse = nursesMap.get(authUser.id)
        if (nurse) {
          role = 'nurse'
          fullName = `${nurse.first_name} ${nurse.last_name}`.trim() || fullName
          email = nurse.email || email
        }
      }

      // Create profile
      const { error: insertError } = await supabaseAdmin.from('profiles').insert({
        uid: authUser.id,
        role: role,
        full_name: fullName || authUser.email?.split('@')[0] || 'User',
        email: email,
        active: true,
      })

      if (insertError) {
        console.error(`Error creating profile for ${authUser.id}:`, insertError)
        errors++
      } else {
        created++
      }
    }

    return NextResponse.json({ 
      success: true, 
      created, 
      errors,
      message: `Created ${created} profiles${errors > 0 ? `, ${errors} errors` : ''}` 
    })
  } catch (error) {
    console.error('Error in sync-profiles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
