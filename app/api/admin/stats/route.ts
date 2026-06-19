import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { isPhysicianRole } from '@/lib/roles'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

async function countTable(
  admin: SupabaseClient,
  table: 'appointments' | 'encounters' | 'pharmacy' | 'patients',
  options?: { encountersActive?: boolean; patientsWithLocation?: boolean }
): Promise<number> {
  try {
    let q = admin.from(table).select('*', { count: 'exact', head: true })
    if (options?.encountersActive) {
      q = q.not('status', 'eq', 'completed')
    }
    if (options?.patientsWithLocation) {
      q = q.not('location_id', 'is', null)
    }
    const { count, error } = await q
    if (error) {
      console.error(`[admin/stats] count ${table}:`, error.message)
      return 0
    }
    return count ?? 0
  } catch (e) {
    console.error(`[admin/stats] count ${table}:`, e)
    return 0
  }
}

export async function GET(_req: NextRequest) {
  try {
    await requireAdminUser()
    const admin = createAdminClient()
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

    const [
      profilesRes,
      auditTotalRes,
      auditTodayRes,
      recentLoginsRes,
      locationsRes,
      patientsRes,
      userLocationsRes,
      recentAuditRes,
    ] = await Promise.all([
      admin.from('profiles').select('role, uid, full_name, email, active').neq('role', 'admin'),
      admin.from('audit_logs').select('*', { count: 'exact', head: true }),
      admin.from('audit_logs').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
      admin
        .from('audit_logs')
        .select('user_name, user_email, user_role, created_at')
        .eq('action', 'user_logged_in')
        .order('created_at', { ascending: false })
        .limit(10),
      admin.from('locations').select('id, title, location_code, address').order('title'),
      admin.from('patients').select('id, location_id'),
      admin.from('user_locations').select('user_uid, location_id'),
      admin
        .from('audit_logs')
        .select('action, user_name, user_email, resource_type, created_at')
        .order('created_at', { ascending: false })
        .limit(12),
    ])

    const [
      totalAppointments,
      activeEncounters,
      totalPharmacies,
      totalPatientsCount,
      patientsWithLocationCount,
    ] = await Promise.all([
      countTable(admin, 'appointments'),
      countTable(admin, 'encounters', { encountersActive: true }),
      countTable(admin, 'pharmacy'),
      countTable(admin, 'patients'),
      countTable(admin, 'patients', { patientsWithLocation: true }),
    ])

    const profiles = (profilesRes.data ?? []).filter((p) => p.active !== false)
    const patients = patientsRes.error ? [] : (patientsRes.data ?? [])
    const userLocations = userLocationsRes.error ? [] : (userLocationsRes.data ?? [])
    const locations = locationsRes.error ? [] : (locationsRes.data ?? [])

    if (locationsRes.error) {
      console.error('[admin/stats] locations:', locationsRes.error.message)
    }
    if (patientsRes.error) {
      console.error('[admin/stats] patients:', patientsRes.error.message)
    }
    if (userLocationsRes.error) {
      console.error('[admin/stats] user_locations:', userLocationsRes.error.message)
    }

    const totalPatients = patientsRes.error ? totalPatientsCount : patients.length || totalPatientsCount
    const patientsWithLocation = patientsRes.error
      ? patientsWithLocationCount
      : patients.filter((p) => p.location_id != null).length || patientsWithLocationCount
    const patientsUnassigned = Math.max(0, totalPatients - patientsWithLocation)

    const locationBreakdown = locations.map((loc) => {
      const patientCount = patients.filter((p) => p.location_id === loc.id).length
      const staffUids = new Set(
        userLocations.filter((ul) => ul.location_id === loc.id).map((ul) => ul.user_uid)
      )
      return {
        id: loc.id,
        title: loc.title,
        location_code: loc.location_code ?? null,
        address: loc.address ?? null,
        patientCount,
        staffCount: staffUids.size,
      }
    })

    return NextResponse.json({
      totalUsers: profiles.length,
      doctors: profiles.filter((p) => isPhysicianRole(p.role)).length,
      nurses: profiles.filter((p) => p.role === 'nurse').length,
      totalAuditEvents: auditTotalRes.count ?? 0,
      todayEvents: auditTodayRes.count ?? 0,
      recentLogins: recentLoginsRes.data ?? [],
      recentActivity: recentAuditRes.data ?? [],
      totalLocations: locations.length,
      totalPatients,
      patientsWithLocation,
      patientsUnassigned,
      totalAppointments,
      activeEncounters,
      totalPharmacies,
      locationBreakdown,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
