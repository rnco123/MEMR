import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { logAuditEvent } from '@/lib/audit-server'
import { revalidateCache } from '@/lib/cache'
import { bridgePost } from '@/lib/bridge/sync'
import type { SignupRequestRow } from '@/lib/signup-requests/types'

export const dynamic = 'force-dynamic'

/**
 * Approve a clinic signup. The bridge creates the tenant, its first location and the
 * staff user (assigned to that location), then lets the user sign in.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdminUser()
    const { id } = params

    const result = await bridgePost<{ data: SignupRequestRow }>(
      `/clinic-signups/${encodeURIComponent(id)}/approve`,
      { reviewed_by: user.id }
    )

    await revalidateCache('locations')
    await logAuditEvent('user_created', 'user', result.data.user_id ?? id, {
      created_by: user.id,
      source: 'clinic_signup',
      signup_request_id: id,
      role: 'clinic_manager',
      email: result.data.email,
      tenant_id: result.data.tenant_id,
      location_id: result.data.location_id,
    })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
