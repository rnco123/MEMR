import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error-handler'
import { fetchTenantLocationIds, requireClinicManager } from '@/lib/manage/auth'
import { latestActivityTimestamp } from '@/lib/flowboard/activity-sort'
import { listPatientIdsVisibleInScope } from '@/lib/patients/patient-location-visibility'
import { loadPatientVisitStats, resolvePatientLastVisit } from '@/lib/patients/patient-visit-stats'

export const dynamic = 'force-dynamic'

/**
 * Read-only patient list for a clinic manager: patients whose home location or any
 * appointment is at one of their tenant's locations — the same visibility rule the
 * clinical patient history uses. Demographics and visit counts only; no chart.
 */
export async function GET() {
  try {
    const { tenantId, admin } = await requireClinicManager()
    const locationIds = [...(await fetchTenantLocationIds(admin, tenantId))]
    const patientIds = await listPatientIdsVisibleInScope(admin, { unrestricted: false, locationIds })
    if (!patientIds?.length) return NextResponse.json({ rows: [], total: 0 })

    const { data: patientsData, error } = await admin
      .from('patients')
      .select('id, first_name, last_name, email, phone, date_of_birth, gender, created_at, created_by_source')
      .in('id', patientIds)
    if (error) throw error

    const ids = (patientsData ?? []).map((p) => p.id)
    const { encounterCounts, encounterLastVisits, appointmentLastVisits } = await loadPatientVisitStats(admin, ids)

    const rows = (patientsData ?? []).map((patient) => ({
      ...patient,
      encounter_count: encounterCounts[patient.id] || 0,
      last_visit: resolvePatientLastVisit(patient.id, encounterLastVisits, appointmentLastVisits),
    }))
    rows.sort(
      (a, b) =>
        new Date(latestActivityTimestamp(b.last_visit, b.created_at)).getTime() -
        new Date(latestActivityTimestamp(a.last_visit, a.created_at)).getTime()
    )

    return NextResponse.json({ rows, total: rows.length })
  } catch (err) {
    return handleApiError(err)
  }
}
