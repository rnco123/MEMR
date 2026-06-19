import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { loadPatientVisitStats, resolvePatientLastVisit } from '@/lib/patients/patient-visit-stats'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    await requireAdminUser()
    const admin = createAdminClient()

    const { data: patientsData, error: patientsError } = await admin
      .from('patients')
      .select('id, first_name, last_name, email, phone, date_of_birth, gender, created_at')
      .order('created_at', { ascending: false })

    if (patientsError) throw patientsError
    if (!patientsData?.length) {
      return NextResponse.json({ rows: [], total: 0 })
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

      return {
        ...patient,
        encounter_count: encounterCounts[patient.id] || 0,
        last_visit: lastVisit,
      }
    })

    return NextResponse.json({ rows, total: rows.length })
  } catch (err) {
    return handleApiError(err)
  }
}
