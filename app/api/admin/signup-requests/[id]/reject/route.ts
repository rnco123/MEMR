import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { logAuditEvent } from '@/lib/audit-server'
import { bridgePost } from '@/lib/bridge/sync'
import { signupRequestRejectSchema, type SignupRequestRow } from '@/lib/signup-requests/types'

export const dynamic = 'force-dynamic'

/** Reject a clinic signup. The bridge deletes the pending auth user. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdminUser()
    const { id } = params
    const parsed = signupRequestRejectSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) throw parsed.error

    const result = await bridgePost<{ data: SignupRequestRow }>(
      `/clinic-signups/${encodeURIComponent(id)}/reject`,
      { reviewed_by: user.id, ...(parsed.data.note ? { note: parsed.data.note } : {}) }
    )

    await logAuditEvent('settings_changed', 'system', id, {
      action: 'signup_request_rejected',
      email: result.data.email,
      actor_id: user.id,
    })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
