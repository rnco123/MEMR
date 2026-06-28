import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  AuthorizationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { getLocationScopeForUser, resolveClinicalApiRole } from '@/lib/locations/scope'
import { loadAvailableDoctors } from '@/lib/doctors/load-available-doctors'
import { UserRole } from '@/lib/roles'

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
    const clinicalRole = resolveClinicalApiRole(profile?.role)
    if (clinicalRole !== UserRole.NURSE && clinicalRole !== UserRole.ADMIN) {
      throw new AuthorizationError()
    }

    const admin = createAdminClient()
    const scope = await getLocationScopeForUser(admin, user.id, clinicalRole)
    const data = await loadAvailableDoctors(admin, scope)

    return NextResponse.json({ data })
  } catch (err) {
    return handleApiError(err)
  }
}
