import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuthenticationError, ValidationError, handleApiError } from '@/lib/api-error-handler'
import { guardEncounterAccess } from '@/lib/encounters/guard'
import { auditPhi } from '@/lib/audit-phi'
import { fetchUserRole } from '@/lib/fetch-user-role'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId) || encounterId <= 0) {
      throw new ValidationError('Invalid encounter id')
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    let body: { service_id?: number }
    try {
      body = (await request.json()) as { service_id?: number }
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const serviceId = Number(body.service_id)
    if (!Number.isFinite(serviceId) || serviceId <= 0) {
      throw new ValidationError('Valid service_id is required')
    }

    // Access guard for clinical staff & nurses assigned to location
    await guardEncounterAccess(user.id, encounterId)

    const admin = createAdminClient()

    // Verify service exists
    const { data: serviceRow, error: serviceErr } = await admin
      .from('services')
      .select('id, title_en, title_es')
      .eq('id', serviceId)
      .maybeSingle()

    if (serviceErr) throw serviceErr
    if (!serviceRow) throw new ValidationError('Selected service does not exist')

    // Find encounter's appointment_id
    const { data: encRow, error: encErr } = await admin
      .from('encounters')
      .select('id, appointment_id')
      .eq('id', encounterId)
      .maybeSingle()

    if (encErr) throw encErr
    if (!encRow || !encRow.appointment_id) {
      throw new ValidationError('Encounter or linked appointment not found')
    }

    // Update appointment's service_id
    const { error: apptErr } = await admin
      .from('appointments')
      .update({
        service_id: serviceId,
      })
      .eq('id', encRow.appointment_id)

    if (apptErr) throw apptErr

    const roleInfo = await fetchUserRole(supabase, user.id)
    auditPhi({
      user,
      role: roleInfo?.role,
      action: 'encounter_updated',
      resourceType: 'encounter',
      resourceId: encounterId,
      metadata: { section: 'appointment_service', service_id: serviceId },
      request,
    })

    return NextResponse.json({
      ok: true,
      service: serviceRow,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
