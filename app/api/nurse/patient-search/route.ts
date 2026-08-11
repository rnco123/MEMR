import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api-error-handler'
import { requireNurseUser } from '@/lib/nurse/require-nurse'
import {
  getLocationScopeForUser,
  parseLocationFilter,
  type LocationScope,
} from '@/lib/locations/scope'
import { applyParsedPatientSearchToQuery } from '@/lib/nurse/patient-search-apply'
import { parsePatientSearchLocally } from '@/lib/nurse/patient-search-local'
import { buildPatientDobFilter } from '@/lib/nurse/patient-search-query'
import { emptyParsedPatientSearch } from '@/lib/nurse/patient-search-types'
import { listPatientIdsVisibleInScope } from '@/lib/patients/patient-location-visibility'
import { UserRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const MAX_RESULTS = 50

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireNurseUser()
    const admin = createAdminClient()
    const scope = await getLocationScopeForUser(admin, user.id, UserRole.NURSE)

    const params = req.nextUrl.searchParams
    const rawSearch = (params.get('search') || '').trim()
    const dobYear = (params.get('dob_year') || '').trim()
    const dobMonth = (params.get('dob_month') || '').trim()
    const dobDay = (params.get('dob_day') || '').trim()

    const dobFilter = buildPatientDobFilter(dobYear, dobMonth, dobDay)
    // No search text and no date-of-birth filter → "show all patients in my location" mode.
    const showAll = !rawSearch && !dobFilter

    // Narrow to a single assigned location when the flowboard filter selects one.
    const locationFilter = parseLocationFilter(scope, params.get('location_id'))
    if (locationFilter === null) {
      // Selected location is outside the nurse's assigned scope.
      return NextResponse.json({ patients: [], showAll })
    }
    const effectiveScope: LocationScope =
      locationFilter != null
        ? { unrestricted: false, locationIds: [locationFilter] }
        : scope

    if (!effectiveScope.unrestricted && effectiveScope.locationIds.length === 0) {
      return NextResponse.json({ patients: [], showAll })
    }

    let query = admin
      .from('patients')
      .select(
        'id, first_name, last_name, email, phone, date_of_birth, gender, street_address, state, zip_code, location_id, created_by_source, locations(title)'
      )
      .limit(MAX_RESULTS)

    if (!effectiveScope.unrestricted) {
      const visiblePatientIds = await listPatientIdsVisibleInScope(admin, effectiveScope)
      if (!visiblePatientIds?.length) {
        return NextResponse.json({ patients: [], showAll })
      }
      query = query.in('id', visiblePatientIds)
    }

    let searchParse: string | null = null
    if (rawSearch) {
      const parsedSearch = parsePatientSearchLocally(rawSearch)
      query = applyParsedPatientSearchToQuery(query, parsedSearch)
      searchParse = parsedSearch.source
    } else if (dobFilter) {
      query = applyParsedPatientSearchToQuery(query, {
        ...emptyParsedPatientSearch(`${dobYear}-${dobMonth}-${dobDay}`),
        dobFilter,
      })
    }

    query = query.order('last_name', { ascending: true }).order('first_name', { ascending: true })

    const { data, error } = await query
    if (error) throw error

    const patients = (data ?? []).map((p) => {
        const loc = p.locations as { title?: string } | null
        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
          phone: p.phone,
          date_of_birth: p.date_of_birth,
          gender: p.gender,
          street_address: p.street_address,
          state: p.state,
          zip_code: p.zip_code,
          location_id: p.location_id,
          location_title: loc?.title ?? null,
          created_by_source: (p as { created_by_source?: string | null }).created_by_source ?? 'QR',
        }
      })

    return NextResponse.json({ patients, searchParse, showAll })
  } catch (err) {
    return handleApiError(err)
  }
}
