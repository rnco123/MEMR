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
import { applyParsedPatientSearchToQuery } from '@/lib/nurse/patient-search-apply'
import { resolvePatientSearch } from '@/lib/nurse/patient-search-openai'
import { loadPatientVisitStats, resolvePatientLastVisit } from '@/lib/patients/patient-visit-stats'
import { listPatientIdsVisibleInScope } from '@/lib/patients/patient-location-visibility'
import { latestActivityTimestamp } from '@/lib/flowboard/activity-sort'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

type PatientHistoryRow = {
  id: number
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
  gender: string | null
  created_at: string
  location_id: number | null
  created_by_source?: string | null
  locations?: { title?: string } | null
}

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

    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || '1'))
    const rawSearch = (req.nextUrl.searchParams.get('search') || '').trim()
    const gender = req.nextUrl.searchParams.get('gender') || 'all'
    const sortBy = req.nextUrl.searchParams.get('sort') || 'recent'

    const parsedSearch = rawSearch ? await resolvePatientSearch(rawSearch) : null

    const admin = createAdminClient()
    const scope = await getLocationScopeForUser(admin, user.id, clinicalRole)
    const locationFilter = parseLocationFilter(
      scope,
      req.nextUrl.searchParams.get('location_id')
    )
    if (locationFilter === null) {
      return NextResponse.json({ rows: [], total: 0, page })
    }

    let query = admin
      .from('patients')
      .select(
        'id, first_name, last_name, email, phone, date_of_birth, gender, created_at, location_id, created_by_source, locations(title)',
        { count: 'exact' }
      )

    if (locationFilter != null) {
      query = query.eq('location_id', locationFilter)
    } else if (!scope.unrestricted) {
      const visiblePatientIds = await listPatientIdsVisibleInScope(admin, scope)
      if (!visiblePatientIds?.length) {
        return NextResponse.json({ rows: [], total: 0, page })
      }
      query = query.in('id', visiblePatientIds)
    }

    if (parsedSearch) {
      query = applyParsedPatientSearchToQuery(query, parsedSearch)
    }

    if (gender !== 'all') {
      query = query.eq('gender', gender)
    }

    if (sortBy === 'recent') {
      // Loaded below — sort by last encounter/appointment activity, not registration date.
    } else {
      query = query.order('last_name', { ascending: true }).order('first_name', { ascending: true })
    }

    let patientsData: PatientHistoryRow[] | null = null
    let count: number | null = null

    if (sortBy === 'recent') {
      const { data, error: patientsError } = await query
      if (patientsError) throw patientsError
      patientsData = (data ?? []) as PatientHistoryRow[]
      count = data?.length ?? 0
    } else {
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error: patientsError, count: totalCount } = await query.range(from, to)
      if (patientsError) throw patientsError
      patientsData = (data ?? []) as PatientHistoryRow[]
      count = totalCount
    }

    if (!patientsData?.length) {
      return NextResponse.json({
        rows: [],
        total: count ?? 0,
        page,
        searchParse: parsedSearch?.source ?? null,
      })
    }

    const patientIds = patientsData.map((p) => p.id)

    const { encounterCounts, encounterLastVisits, appointmentLastVisits } =
      await loadPatientVisitStats(admin, patientIds)

    const rows = patientsData.map((patient) => {
      const lastVisit = resolvePatientLastVisit(
        patient.id,
        encounterLastVisits,
        appointmentLastVisits
      )

      const loc = patient.locations as { title?: string } | null
      const locationTitle = loc?.title ?? null

      return {
        id: patient.id,
        first_name: patient.first_name,
        last_name: patient.last_name,
        email: patient.email,
        phone: patient.phone,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
        created_at: patient.created_at,
        location_id: patient.location_id,
        location_title: locationTitle,
        created_by_source: (patient as { created_by_source?: string | null }).created_by_source ?? 'QR',
        encounter_count: encounterCounts[patient.id] || 0,
        last_visit: lastVisit,
      }
    })

    if (sortBy === 'visits') {
      rows.sort((a, b) => (b.encounter_count ?? 0) - (a.encounter_count ?? 0))
    } else if (sortBy === 'recent') {
      rows.sort((a, b) => {
        const aActivity = latestActivityTimestamp(a.last_visit, a.created_at)
        const bActivity = latestActivityTimestamp(b.last_visit, b.created_at)
        return new Date(bActivity).getTime() - new Date(aActivity).getTime()
      })
      const from = (page - 1) * PAGE_SIZE
      const pagedRows = rows.slice(from, from + PAGE_SIZE)
      return NextResponse.json({
        rows: pagedRows,
        total: rows.length,
        page,
        searchParse: parsedSearch?.source ?? null,
      })
    }

    return NextResponse.json({
      rows,
      total: count ?? rows.length,
      page,
      searchParse: parsedSearch?.source ?? null,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
