import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchProfileFields, fetchUserRole } from '@/lib/fetch-user-role'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from '@/lib/api-error-handler'
import { listImmigrationCases } from '@/lib/immigration/case-sync'
import { isI693ApiRole } from '@/lib/immigration/api-auth'
import { guardI693EncounterAccess } from '@/lib/encounters/guard'
import { logI693Audit } from '@/lib/i693/audit-log'
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

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isI693ApiRole(roleInfo?.role)) throw new AuthorizationError()
    const role = roleInfo!.role!.trim().toLowerCase()

    let body: { encounter_ids?: unknown }
    try {
      body = await req.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    if (!Array.isArray(body.encounter_ids)) {
      throw new ValidationError('encounter_ids must be an array')
    }

    const encounterIds = [
      ...new Set(
        body.encounter_ids
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      ),
    ]
    if (encounterIds.length === 0 || encounterIds.length !== body.encounter_ids.length) {
      throw new ValidationError('Invalid encounter ids')
    }
    if (encounterIds.length > 300) {
      throw new ValidationError('A maximum of 300 cases can be closed at once')
    }

    await Promise.all(encounterIds.map((encounterId) => guardI693EncounterAccess(user.id, encounterId)))

    const admin = createAdminClient()
    const { data: cases, error: casesError } = await admin
      .from('immigration_cases')
      .select('encounter_id, patient_id, status, closed_at')
      .in('encounter_id', encounterIds)
    if (casesError) throw casesError

    const eligibleIds = new Set(
      (cases ?? [])
        .filter((row) => row.status === 'delivered' && !row.closed_at)
        .map((row) => Number(row.encounter_id))
    )
    if (eligibleIds.size !== encounterIds.length) {
      throw new ValidationError('Only open, delivered cases can be closed')
    }

    const actorProfile = await fetchProfileFields(supabase, user.id, 'full_name, email', {
      email: user.email,
    })
    const actorName =
      (typeof actorProfile?.full_name === 'string' && actorProfile.full_name.trim()) ||
      (typeof actorProfile?.email === 'string' && actorProfile.email.trim()) ||
      user.email ||
      'Unknown user'
    const now = new Date().toISOString()

    const { data: closedCases, error: closeError } = await admin
      .from('immigration_cases')
      .update({
        closed_at: now,
        closed_by: user.id,
        closed_by_name: actorName,
        updated_at: now,
      })
      .in('encounter_id', encounterIds)
      .eq('status', 'delivered')
      .is('closed_at', null)
      .select('encounter_id, patient_id')
    if (closeError) throw closeError

    await Promise.all(
      (closedCases ?? []).map((row) =>
        logI693Audit('workflow_updated', Number(row.encounter_id), {
          patient_id: Number(row.patient_id),
          status: 'closed',
          role,
          source: role === 'admin' ? 'admin' : 'clinical',
        })
      )
    )

    return NextResponse.json({
      data: {
        closed_encounter_ids: (closedCases ?? []).map((row) => Number(row.encounter_id)),
      },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
