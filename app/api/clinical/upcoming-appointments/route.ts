import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  AuthorizationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { loadUpcomingAppointmentsForDoctor } from '@/lib/clinical/load-upcoming-appointments'
import { isPhysicianRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) throw new AuthenticationError()

    const profile = await fetchUserRole(supabase, user.id)
    if (!profile?.role || !isPhysicianRole(profile.role)) {
      throw new AuthorizationError()
    }

    const admin = createAdminClient()
    const data = await loadUpcomingAppointmentsForDoctor(admin, user.id)

    return NextResponse.json({ data })
  } catch (err) {
    return handleApiError(err)
  }
}
