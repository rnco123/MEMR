import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error-handler'
import { fetchTenantReadScope, requireClinicManager } from '@/lib/manage/auth'
import { listPatientIdsVisibleInScope } from '@/lib/patients/patient-location-visibility'
import { isPhysicianRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

/** Clinic manager dashboard: the admin overview's numbers, for one tenant only. */
export async function GET() {
  try {
    const { tenantId, admin } = await requireClinicManager()
    const { locationIds, staffUids } = await fetchTenantReadScope(admin, tenantId)

    const none = Promise.resolve({ data: [], error: null, count: 0 })
    const [locationsRes, staffRes, userLocationsRes, homePatientsRes, appointmentsRes, activeEncountersRes, loginsRes] =
      await Promise.all([
        admin
          .from('locations')
          .select('id, title, location_code, address')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('title'),
        staffUids.length
          ? admin.from('profiles').select('uid, role, active').in('uid', staffUids)
          : none,
        locationIds.length
          ? admin.from('user_locations').select('user_uid, location_id').in('location_id', locationIds)
          : none,
        locationIds.length
          ? admin.from('patients').select('location_id').in('location_id', locationIds)
          : none,
        locationIds.length
          ? admin
              .from('appointments')
              .select('id', { count: 'exact', head: true })
              .in('location_id', locationIds)
          : none,
        locationIds.length
          ? admin
              .from('encounters')
              .select('id, appointments!inner(location_id)', { count: 'exact', head: true })
              .in('appointments.location_id', locationIds)
              .not('status', 'eq', 'completed')
          : none,
        staffUids.length
          ? admin
              .from('audit_logs')
              .select('user_name, user_email, user_role, created_at')
              .eq('action', 'user_logged_in')
              .in('user_id', staffUids)
              .order('created_at', { ascending: false })
              .limit(10)
          : none,
      ])

    for (const res of [locationsRes, staffRes, userLocationsRes, homePatientsRes, appointmentsRes, activeEncountersRes, loginsRes]) {
      if (res.error) throw res.error
    }

    const patientIds = await listPatientIdsVisibleInScope(admin, { unrestricted: false, locationIds })
    const staff = ((staffRes.data ?? []) as { uid: string; role: string; active: boolean | null }[]).filter(
      (p) => p.active !== false
    )
    const homePatients = (homePatientsRes.data ?? []) as { location_id: number | null }[]
    const links = (userLocationsRes.data ?? []) as { user_uid: string; location_id: number }[]

    const locationBreakdown = ((locationsRes.data ?? []) as {
      id: number
      title: string
      location_code: string | null
      address: string | null
    }[]).map((loc) => ({
      ...loc,
      patientCount: homePatients.filter((p) => p.location_id === loc.id).length,
      staffCount: new Set(links.filter((l) => l.location_id === loc.id).map((l) => l.user_uid)).size,
    }))

    return NextResponse.json({
      totalStaff: staff.length,
      doctors: staff.filter((p) => isPhysicianRole(p.role)).length,
      nurses: staff.filter((p) => p.role === 'nurse').length,
      totalLocations: locationBreakdown.length,
      totalPatients: patientIds?.length ?? 0,
      totalAppointments: appointmentsRes.count ?? 0,
      activeEncounters: activeEncountersRes.count ?? 0,
      recentLogins: loginsRes.data ?? [],
      locationBreakdown,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
