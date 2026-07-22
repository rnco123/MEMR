import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  getLocationScopeForUser,
  parseLocationFilter,
  resolveClinicalApiRole,
} from '@/lib/locations/scope'
import { buildFlowboardRows, getDoctorIdForUser } from '@/lib/locations/flowboard-data'
import { UserRole, isPhysicianRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
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

    const modeParam = req.nextUrl.searchParams.get('mode')
    const mode =
      modeParam === 'nurse' || modeParam === 'doctor' || modeParam === 'admin'
        ? modeParam
        : clinicalRole === UserRole.NURSE
          ? 'nurse'
          : clinicalRole === UserRole.ADMIN
            ? 'admin'
            : 'doctor'

    if (mode === 'doctor' && !isPhysicianRole(clinicalRole) && clinicalRole !== UserRole.ADMIN) {
      throw new AuthorizationError()
    }
    if (mode === 'nurse' && clinicalRole !== UserRole.NURSE && clinicalRole !== UserRole.ADMIN) {
      throw new AuthorizationError()
    }

    const admin = createAdminClient()
    const scope = await getLocationScopeForUser(admin, user.id, clinicalRole)
    const locationFilter = parseLocationFilter(
      scope,
      req.nextUrl.searchParams.get('location_id')
    )
    if (locationFilter === null) {
      return NextResponse.json({ data: [] })
    }

    let doctorId: number | null = null
    if (mode === 'doctor') {
      doctorId = await getDoctorIdForUser(admin, user.id)
    }

    const scopeParam = req.nextUrl.searchParams.get('scope')
    const dateScope = scopeParam === 'future' ? 'future' : 'active'

    const data = await buildFlowboardRows(admin, scope, {
      mode,
      doctorId,
      locationFilterId: locationFilter,
      dateScope,
    })

    return NextResponse.json({ data })
  } catch (err) {
    return handleApiError(err)
  }
}
