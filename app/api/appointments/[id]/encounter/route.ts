import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { assertEncounterAccess } from '@/lib/encounters/assert-access'
import { CLINICAL_STAFF_WITH_ADMIN_ROLE_SET } from '@/lib/roles'

export const dynamic = 'force-dynamic'

function parseAppointmentId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid appointment id')
  return id
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const appointmentId = parseAppointmentId(params.id)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!roleInfo?.role || !CLINICAL_STAFF_WITH_ADMIN_ROLE_SET.has(roleInfo.role)) {
      throw new AuthorizationError()
    }

    const admin = createAdminClient()
    const { data: encounter, error } = await admin
      .from('encounters')
      .select('id, status, appointment_id')
      .eq('appointment_id', appointmentId)
      .maybeSingle()

    if (error) throw error
    if (!encounter?.id) {
      return NextResponse.json({ data: null })
    }

    await assertEncounterAccess(admin, user.id, encounter.id)

    return NextResponse.json({
      data: { id: encounter.id, status: encounter.status ?? null },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
