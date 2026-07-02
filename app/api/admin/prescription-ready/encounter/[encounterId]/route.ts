import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  NotFoundError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  admin_status: z.enum(['pending', 'sent_to_pharmacy']),
})

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

/** Update admin status for every prescription on an encounter (grouped queue). */
export async function PATCH(
  request: Request,
  { params }: { params: { encounterId: string } }
) {
  try {
    const encounterId = parseEncounterId(params.encounterId)
    const user = await requireAdminUser()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const admin = createAdminClient()
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('prescription_ready')
      .update({
        admin_status: parsed.data.admin_status,
        admin_status_updated_at: now,
        admin_status_updated_by: user.id,
      })
      .eq('encounter_id', encounterId)
      .select('id')

    if (error) throw error
    if (!data?.length) {
      throw new NotFoundError('No prescriptions in queue for this encounter')
    }

    auditPhi({
      user,
      role: 'admin',
      action: 'prescription_updated',
      resourceType: 'prescription',
      resourceId: encounterId,
      metadata: {
        scope: 'admin_queue_encounter',
        admin_status: parsed.data.admin_status,
        updated_count: data.length,
      },
      request,
    })

    return NextResponse.json({
      success: true,
      encounter_id: encounterId,
      admin_status: parsed.data.admin_status,
      updated_count: data.length,
      admin_status_updated_at: now,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
