import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api-error-handler'
import { requireNurseUser } from '@/lib/nurse/require-nurse'
import { getLocationScopeForUser } from '@/lib/locations/scope'
import {
  parseSearchDateToIso,
  sanitizePatientSearchTerm,
} from '@/lib/nurse/patient-search-query'
import { UserRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const MAX_RESULTS = 50

function buildDobFilter(
  year: string,
  month: string,
  day: string
): { gte?: string; lte?: string; eq?: string } | null {
  if (!year) return null
  if (month && day) {
    return { eq: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` }
  }
  if (month) {
    const y = year
    const m = month.padStart(2, '0')
    const lastDay = new Date(Number(year), Number(month), 0).getDate()
    return { gte: `${y}-${m}-01`, lte: `${y}-${m}-${String(lastDay).padStart(2, '0')}` }
  }
  return { gte: `${year}-01-01`, lte: `${year}-12-31` }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireNurseUser()
    const admin = createAdminClient()
    const scope = await getLocationScopeForUser(admin, user.id, UserRole.NURSE)

    const rawSearch = (req.nextUrl.searchParams.get('search') || '').trim()
    const dobYear = (req.nextUrl.searchParams.get('dob_year') || '').trim()
    const dobMonth = (req.nextUrl.searchParams.get('dob_month') || '').trim()
    const dobDay = (req.nextUrl.searchParams.get('dob_day') || '').trim()

    const search = sanitizePatientSearchTerm(rawSearch)
    const parsedDateFromSearch = parseSearchDateToIso(rawSearch)

    if (!search && !dobYear && !parsedDateFromSearch) {
      return NextResponse.json({ patients: [] })
    }

    if (!scope.unrestricted && scope.locationIds.length === 0) {
      return NextResponse.json({ patients: [] })
    }

    let query = admin
      .from('patients')
      .select(
        'id, first_name, last_name, email, phone, date_of_birth, gender, street_address, state, zip_code, location_id, locations(title)'
      )
      .limit(MAX_RESULTS)

    if (!scope.unrestricted) {
      const ids = scope.locationIds.join(',')
      query = query.or(`location_id.in.(${ids}),location_id.is.null`)
    }

    if (search) {
      const term = `%${search}%`
      const num = parseInt(search, 10)
      if (!Number.isNaN(num) && String(num) === search) {
        query = query.or(
          `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term},id.eq.${num}`
        )
      } else {
        query = query.or(
          `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`
        )
      }
    }

    let dobFilter = buildDobFilter(dobYear, dobMonth, dobDay)
    if (!dobFilter && parsedDateFromSearch) {
      dobFilter = { eq: parsedDateFromSearch }
    }

    if (dobFilter?.eq) {
      query = query.eq('date_of_birth', dobFilter.eq)
    } else if (dobFilter?.gte && dobFilter.lte) {
      query = query.gte('date_of_birth', dobFilter.gte).lte('date_of_birth', dobFilter.lte)
    }

    query = query.order('last_name', { ascending: true }).order('first_name', { ascending: true })

    const { data, error } = await query
    if (error) throw error

    const patients = (data ?? [])
      .filter((p) => {
        if (scope.unrestricted) return true
        if (scope.locationIds.length === 0) return false
        if (p.location_id == null) return true
        return scope.locationIds.includes(p.location_id)
      })
      .map((p) => {
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

    return NextResponse.json({ patients })
  } catch (err) {
    return handleApiError(err)
  }
}
