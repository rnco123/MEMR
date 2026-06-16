import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api-error-handler'

export const dynamic = 'force-dynamic'

/**
 * Sync existing auth users to the profiles table for chat.
 * Restricted to admin users only (H-04a).
 * Debug telemetry calls have been removed (H-04c).
 */
export async function POST() {
  try {
    // H-04a: Only admin can sync/create profiles in bulk.
    await requireAdminUser()

    const supabaseAdmin = createAdminClient()

    // Get all auth users (admin API — admin-only, H-04b).
    const {
      data: { users: authUsers },
      error: usersError,
    } = await supabaseAdmin.auth.admin.listUsers()

    if (usersError) {
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Get existing profiles
    const { data: existingProfiles } = await supabaseAdmin.from('profiles').select('uid')
    const existingUids = new Set(existingProfiles?.map((p) => p.uid) || [])

    // Get doctors and nurses to resolve names
    const { data: doctors } = await supabaseAdmin
      .from('doctors')
      .select('user_id, first_name, last_name, email')
    const { data: nurses } = await supabaseAdmin
      .from('nurses')
      .select('user_id, first_name, last_name, email')

    const doctorsMap = new Map(doctors?.map((d) => [d.user_id, d]) || [])
    const nursesMap = new Map(nurses?.map((n) => [n.user_id, n]) || [])

    let created = 0
    let errors = 0
    let skipped = 0

    for (const authUser of authUsers) {
      if (existingUids.has(authUser.id)) {
        skipped++
        continue
      }

      // H-04d: Role comes from doctors/nurses tables, never from metadata alone.
      let role = 'staff'
      let fullName = ''
      let email = authUser.email || ''

      const doctor = doctorsMap.get(authUser.id)
      if (doctor) {
        role = 'doctor'
        fullName = `${doctor.first_name} ${doctor.last_name}`.trim()
        email = doctor.email || email
      } else {
        const nurse = nursesMap.get(authUser.id)
        if (nurse) {
          role = 'nurse'
          fullName = `${nurse.first_name} ${nurse.last_name}`.trim()
          email = nurse.email || email
        }
      }

      const { error: insertError } = await supabaseAdmin.from('profiles').insert({
        uid: authUser.id,
        role,
        full_name: fullName || authUser.email?.split('@')[0] || 'User',
        email,
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
      skipped,
      message: `Created ${created} profiles${errors > 0 ? `, ${errors} errors` : ''}${skipped > 0 ? `, ${skipped} already exist` : ''}`,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
