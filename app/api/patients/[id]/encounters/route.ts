import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { guardPatientAccess } from '@/lib/encounters/guard'
import { handleApiError } from '@/lib/api-error-handler'

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

    const { data: encounters, error } = await admin
      .from('encounters')
      .select(`
        *,
        appointments (*),
        doctors (*)
      `)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch encounters: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ encounters: encounters ?? [] })
  } catch (error) {
    return handleApiError(error)
  }
}
