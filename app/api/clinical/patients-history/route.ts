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
import { parseSearchDateToIso, sanitizePatientSearchTerm } from '@/lib/nurse/patient-search-query'
import { loadPatientVisitStats, resolvePatientLastVisit } from '@/lib/patients/patient-visit-stats'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

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
    const search = sanitizePatientSearchTerm(rawSearch)
    const gender = req.nextUrl.searchParams.get('gender') || 'all'
    const sortBy = req.nextUrl.searchParams.get('sort') || 'name'
    const dobYear = (req.nextUrl.searchParams.get('dob_year') || '').trim()
    const dobMonth = (req.nextUrl.searchParams.get('dob_month') || '').trim()
    const dobDay = (req.nextUrl.searchParams.get('dob_day') || '').trim()

    // Build DOB filter from explicit dropdowns OR from auto-detected date in search text
    function buildDobFilter(y: string, m: string, d: string) {
      if (!y) return null
      if (m && d) return { eq: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` }
      if (m) {
        const lastDay = new Date(Number(y), Number(m), 0).getDate()
        return { gte: `${y}-${m.padStart(2, '0')}-01`, lte: `${y}-${m.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` }
      }
      return { gte: `${y}-01-01`, lte: `${y}-12-31` }
    }
    let dobFilter = buildDobFilter(dobYear, dobMonth, dobDay)
    if (!dobFilter) {
      const parsedDate = parseSearchDateToIso(rawSearch)
      if (parsedDate) dobFilter = { eq: parsedDate }
    }

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
        'id, first_name, last_name, email, phone, date_of_birth, gender, created_at, location_id, locations(title)',
        { count: 'exact' }
      )

    if (locationFilter != null) {
      query = query.eq('location_id', locationFilter)
    } else if (!scope.unrestricted) {
      if (scope.locationIds.length === 0) {
        return NextResponse.json({ rows: [], total: 0, page })
      }
      query = query.in('location_id', scope.locationIds)
    }

    if (search && !dobFilter) {
      // Only apply text search when not overridden by a DOB filter
      const term = `%${search}%`
      const numTerm = parseInt(search, 10)
      if (!Number.isNaN(numTerm)) {
        query = query.or(
          `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term},id.eq.${numTerm}`
        )
      } else {
        query = query.or(
          `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`
        )
      }
    }

    if (dobFilter && 'eq' in dobFilter) {
      query = query.eq('date_of_birth', dobFilter.eq)
    } else if (dobFilter && 'gte' in dobFilter) {
      query = query.gte('date_of_birth', dobFilter.gte!).lte('date_of_birth', dobFilter.lte!)
    }

    if (gender !== 'all') {
      query = query.eq('gender', gender)
    }

    if (sortBy === 'recent') {
      query = query.order('created_at', { ascending: false })
    } else {
      query = query.order('last_name', { ascending: true }).order('first_name', { ascending: true })
    }

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data: patientsData, error: patientsError, count } = await query.range(from, to)

    if (patientsError) throw patientsError
    if (!patientsData?.length) {
      return NextResponse.json({ rows: [], total: count ?? 0, page })
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
        encounter_count: encounterCounts[patient.id] || 0,
        last_visit: lastVisit,
      }
    })

    if (sortBy === 'visits') {
      rows.sort((a, b) => (b.encounter_count ?? 0) - (a.encounter_count ?? 0))
    }

    return NextResponse.json({ rows, total: count ?? rows.length, page })
  } catch (err) {
    return handleApiError(err)
  }
}
