import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { guardPatientAccess } from '@/lib/encounters/guard'
import { handleApiError } from '@/lib/api-error-handler'
import { loadEncountersForPatient, enrichEncountersWithProviderRoles } from '@/lib/patients/patient-encounters'
import { filterEncountersForClinicalViewer } from '@/lib/patients/patient-location-visibility'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const patientId = Number(params.id)

    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 })
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = await guardPatientAccess(user.id, patientId)
    const encounters = await loadEncountersForPatient(admin, patientId)
    await enrichEncountersWithProviderRoles(admin, encounters)
    const visible = await filterEncountersForClinicalViewer(admin, user.id, encounters)

    return NextResponse.json({ encounters: visible })
  } catch (error) {
    return handleApiError(error)
  }
}
