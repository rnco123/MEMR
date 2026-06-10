import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { handleApiError, AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { listImmigrationCases } from '@/lib/immigration/case-sync'
import { isI693ApiRole } from '@/lib/immigration/api-auth'
import {
  getLocationScopeForUser,
  resolveClinicalApiRole,
  type LocationScope,
} from '@/lib/locations/scope'

export const dynamic = 'force-dynamic'

function parseLocationFilters(
  scope: LocationScope,
  searchParams: URLSearchParams
): number[] | null | undefined {
  const rawValues = [
    ...searchParams.getAll('location_id'),
    ...searchParams.getAll('location_ids').flatMap((value) => value.split(',')),
  ]
    .map((value) => value.trim())
    .filter((value) => value && value !== 'all')

  if (rawValues.length === 0) return undefined

  const ids = [...new Set(rawValues.map((value) => Number(value)))]
  const validIds = ids.filter((id) => Number.isFinite(id) && id > 0)
  if (validIds.length === 0) return undefined

  if (!scope.unrestricted && validIds.some((id) => !scope.locationIds.includes(id))) {
    return null
  }

  return validIds
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isI693ApiRole(roleInfo?.role)) throw new AuthorizationError()

    const admin = createAdminClient()
    const clinicalRole = resolveClinicalApiRole(roleInfo?.role)
    if (!clinicalRole) throw new AuthorizationError()

    const scope = await getLocationScopeForUser(admin, user.id, clinicalRole)
    const locationFilters = parseLocationFilters(scope, req.nextUrl.searchParams)
    if (locationFilters === null) {
      return NextResponse.json({ data: [], count: 0 })
    }

    const data = await listImmigrationCases(admin, {
      scope,
      locationFilterIds: locationFilters,
    })

    return NextResponse.json({ data, count: data.length })
  } catch (e) {
    return handleApiError(e)
  }
}
