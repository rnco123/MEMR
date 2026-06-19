import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  getLocationScopeForUser,
  isAllowedByLocationScope,
  parseLocationFilter,
  resolveClinicalApiRole,
} from '@/lib/locations/scope'
import { UserRole, isPhysicianRole, CLINICAL_STAFF_ROLE_VALUES } from '@/lib/roles'
import { getDoctorIdForUser } from '@/lib/locations/flowboard-data'

export const dynamic = 'force-dynamic'

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

    const admin = createAdminClient()
    const scope = await getLocationScopeForUser(admin, user.id, clinicalRole)
    const locationFilter = parseLocationFilter(
      scope,
      req.nextUrl.searchParams.get('location_id')
    )
    if (locationFilter === null) {
      return NextResponse.json({ totalPatients: 0, totalConsultations: 0 })
    }

    const { data: patients } = await admin.from('patients').select('id, location_id')
    const allowedPatientIds = new Set<number>()
    for (const p of patients ?? []) {
      const locId = p.location_id as number | null
      if (locationFilter != null) {
        if (locId === locationFilter) allowedPatientIds.add(p.id)
        continue
      }
      if (isAllowedByLocationScope(scope, locId)) {
        allowedPatientIds.add(p.id)
      }
    }

    let totalConsultations = 0
    if (isPhysicianRole(clinicalRole)) {
      const doctorId = await getDoctorIdForUser(admin, user.id)
      if (doctorId != null) {
        const { data: encounters } = await admin
          .from('encounters')
          .select('id, patient_id, status')
          .eq('doctor_id', doctorId)
          .in('status', ['consultation_concluded', 'final_review', 'completed'])

        totalConsultations =
          encounters?.filter((e) => e.patient_id != null && allowedPatientIds.has(e.patient_id))
            .length ?? 0
      }
    } else if (clinicalRole === UserRole.NURSE) {
      const { data: encounters } = await admin
        .from('encounters')
        .select('id, patient_id')
        .in('patient_id', allowedPatientIds.size > 0 ? [...allowedPatientIds] : [-1])

      totalConsultations = encounters?.length ?? 0
    } else {
      totalConsultations = 0
    }

    return NextResponse.json({
      totalPatients: allowedPatientIds.size,
      totalConsultations,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
