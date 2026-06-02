import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  getAssignedLocations,
  getLocationScopeForUser,
  resolveClinicalApiRole,
} from '@/lib/locations/scope'

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
    if (!clinicalRole) {
      throw new AuthorizationError()
    }

    const admin = createAdminClient()
    const [locations, scope] = await Promise.all([
      getAssignedLocations(admin, user.id, clinicalRole),
      getLocationScopeForUser(admin, user.id, clinicalRole),
    ])

    return NextResponse.json({
      locations,
      unrestricted: scope.unrestricted,
      locationIds: scope.locationIds,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
