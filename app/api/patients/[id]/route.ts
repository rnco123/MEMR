import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AuthenticationError, handleApiError } from '@/lib/api-error-handler'
import { guardPatientAccess } from '@/lib/encounters/guard'
import { loadPatientFileHeader } from '@/lib/encounters/load-encounter-detail'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const patientId = Number(params.id)
    if (!Number.isFinite(patientId) || patientId <= 0) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const admin = await guardPatientAccess(user.id, patientId)
    const patient = await loadPatientFileHeader(admin, patientId)

    return NextResponse.json({ patient })
  } catch (e) {
    return handleApiError(e)
  }
}
