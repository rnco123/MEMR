import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AuthenticationError,
  AuthorizationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { getLocationScopeForUser, resolveClinicalApiRole } from '@/lib/locations/scope'
import { moveAppointmentToFlowboardToday } from '@/lib/appointments/move-to-flowboard'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) throw new AuthenticationError()

    const profile = await fetchUserRole(supabase, user.id)
    const clinicalRole = resolveClinicalApiRole(profile?.role)
    if (!clinicalRole) throw new AuthorizationError()

    const { id } = await context.params
    const appointmentId = Number(id)
    if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
      return NextResponse.json({ error: 'Invalid appointment id' }, { status: 400 })
    }

    const admin = createAdminClient()
    const scope = await getLocationScopeForUser(admin, user.id, clinicalRole)
    const result = await moveAppointmentToFlowboardToday(admin, scope, appointmentId)

    auditPhi({
      user,
      role: profile?.role ?? clinicalRole,
      action: 'appointment_updated',
      resourceType: 'appointment',
      resourceId: appointmentId,
      metadata: {
        scope: 'move_to_flowboard',
        previous_appointment_date: result.previous_appointment_date,
        appointment_date: result.appointment_date,
      },
      request,
    })

    return NextResponse.json({ data: result })
  } catch (err) {
    return handleApiError(err)
  }
}
