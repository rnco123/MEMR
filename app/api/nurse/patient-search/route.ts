import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api-error-handler'
import { requireNurseUser } from '@/lib/nurse/require-nurse'
import { getLocationScopeForUser } from '@/lib/locations/scope'
import { applyParsedPatientSearchToQuery } from '@/lib/nurse/patient-search-apply'
import { resolvePatientSearch } from '@/lib/nurse/patient-search-openai'
import { listPatientIdsVisibleInScope } from '@/lib/patients/patient-location-visibility'
import { UserRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const MAX_RESULTS = 50

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireNurseUser()
    const admin = createAdminClient()
    const scope = await getLocationScopeForUser(admin, user.id, UserRole.NURSE)

    const rawSearch = (req.nextUrl.searchParams.get('search') || '').trim()

    if (!rawSearch) {
      return NextResponse.json({ patients: [] })
    }

    if (!scope.unrestricted && scope.locationIds.length === 0) {
      return NextResponse.json({ patients: [] })
    }

    const parsedSearch = await resolvePatientSearch(rawSearch)

    let query = admin
      .from('patients')
      .select(
        'id, first_name, last_name, email, phone, date_of_birth, gender, street_address, state, zip_code, location_id, locations(title)'
      )
      .limit(MAX_RESULTS)

    if (!scope.unrestricted) {
      const visiblePatientIds = await listPatientIdsVisibleInScope(admin, scope)
      if (!visiblePatientIds?.length) {
        return NextResponse.json({ patients: [] })
      }
      query = query.in('id', visiblePatientIds)
    }

    query = applyParsedPatientSearchToQuery(query, parsedSearch)
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
        }
      })

    return NextResponse.json({ patients, searchParse: parsedSearch.source })
  } catch (err) {
    return handleApiError(err)
  }
}
