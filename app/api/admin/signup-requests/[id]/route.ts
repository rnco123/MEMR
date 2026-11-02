import { NextRequest, NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { logAuditEvent } from '@/lib/audit-server'
import { bridgePatch } from '@/lib/bridge/sync'
import { signupRequestEditSchema, type SignupRequestRow } from '@/lib/signup-requests/types'

export const dynamic = 'force-dynamic'

/** Admin edits a pending signup before approving it. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdminUser()
    const { id } = params

    let body: unknown
    try {
      body = await req.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }
    const parsed = signupRequestEditSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const result = await bridgePatch<{ data: SignupRequestRow }>(
      `/clinic-signups/${encodeURIComponent(id)}`,
      parsed.data
    )

    await logAuditEvent('settings_changed', 'system', id, {
      action: 'signup_request_edited',
      fields: Object.keys(parsed.data),
      actor_id: user.id,
    })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
