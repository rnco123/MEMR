import { NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { revalidateCache } from '@/lib/cache'
import { logAuditEvent } from '@/lib/audit-server'
import { bridgeGet, bridgePost } from '@/lib/bridge/sync'
import { serviceCreateSchema, type AdminService } from '@/lib/services/admin-service'

export const dynamic = 'force-dynamic'

/**
 * Services are mastered in the EMR and mirrored to the portal by mcm-bridge, which
 * owns both connections. This route keeps admin auth, validation and auditing.
 */
export async function GET() {
  try {
    await requireAdminUser()
    const data = await bridgeGet<AdminService[]>('/services')
    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminUser()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = serviceCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const result = await bridgePost<{ data: AdminService; portal_synced: boolean }>(
      '/services',
      parsed.data
    )

    await revalidateCache('services')
    await logAuditEvent('settings_changed', 'system', result.data.id, {
      action: 'service_created',
      title_en: result.data.title_en,
      actor_id: user.id,
    })

    return NextResponse.json({
      success: true,
      data: result.data,
      portal_synced: result.portal_synced,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
