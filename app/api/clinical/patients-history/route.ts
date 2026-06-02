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
    const search = (req.nextUrl.searchParams.get('search') || '').trim()
    const gender = req.nextUrl.searchParams.get('gender') || 'all'
    const sortBy = req.nextUrl.searchParams.get('sort') || 'name'

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

    if (search) {
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

    const [encountersRes, appointmentsRes] = await Promise.all([
      admin
        .from('encounters')
        .select('id, patient_id, created_at')
        .in('patient_id', patientIds),
      admin
        .from('appointments')
        .select('patient_id, appointment_date, appointment_time')
        .in('patient_id', patientIds),
    ])

    const encounterCounts: Record<number, number> = {}
    const encounterLastVisits: Record<number, string> = {}
    const appointmentLastVisits: Record<number, string> = {}

    for (const encounter of encountersRes.data ?? []) {
      const pid = encounter.patient_id
      if (!pid) continue
      encounterCounts[pid] = (encounterCounts[pid] || 0) + 1
      if (!encounterLastVisits[pid] || encounter.created_at > encounterLastVisits[pid]) {
        encounterLastVisits[pid] = encounter.created_at
      }
    }

    for (const appointment of appointmentsRes.data ?? []) {
      if (!appointment.patient_id || !appointment.appointment_date) continue
      const dateTimeString = appointment.appointment_time
        ? `${appointment.appointment_date}T${appointment.appointment_time}`
        : appointment.appointment_date
      const existing = appointmentLastVisits[appointment.patient_id]
      if (!existing || new Date(dateTimeString).getTime() > new Date(existing).getTime()) {
        appointmentLastVisits[appointment.patient_id] = dateTimeString
      }
    }

    const rows = patientsData.map((patient) => {
      const encounterDate = encounterLastVisits[patient.id] || null
      const appointmentDate = appointmentLastVisits[patient.id] || null
      let lastVisit: string | null = null
      if (encounterDate && appointmentDate) {
        lastVisit =
          new Date(encounterDate).getTime() >= new Date(appointmentDate).getTime()
            ? encounterDate
            : appointmentDate
      } else {
        lastVisit = encounterDate || appointmentDate
      }

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
