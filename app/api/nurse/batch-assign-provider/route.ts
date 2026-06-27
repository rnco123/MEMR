import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { getLocationScopeForUser } from '@/lib/locations/scope'
import { UserRole } from '@/lib/roles'
import { requireNurseUser } from '@/lib/nurse/require-nurse'
import { getProfileId } from '@/lib/status-timeline'
import { batchAssignProvider } from '@/lib/nurse/batch-assign-provider'

export const dynamic = 'force-dynamic'

const batchAssignSchema = z.object({
  appointment_ids: z.array(z.number().int().positive()).min(1).max(50),
  doctor_id: z.number().int().positive(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  appointment_time: z.string().optional().nullable(),
})

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireNurseUser()
    const admin = createAdminClient()
    const scope = await getLocationScopeForUser(admin, user.id, UserRole.NURSE)

    if (!scope.unrestricted && scope.locationIds.length === 0) {
      return NextResponse.json({ success: true, assigned: 0, failed: 0, results: [] })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = batchAssignSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const profileId = await getProfileId(supabase, user.id)

    const result = await batchAssignProvider(admin, scope, {
      appointmentIds: parsed.data.appointment_ids,
      doctorId: parsed.data.doctor_id,
      appointmentDate: parsed.data.appointment_date,
      appointmentTime: parsed.data.appointment_time,
      profileId,
    })

    return NextResponse.json({
      success: result.failed === 0,
      assigned: result.assigned,
      failed: result.failed,
      results: result.results,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
