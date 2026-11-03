import { NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { revalidateCache } from '@/lib/cache'
import { logAuditEvent } from '@/lib/audit-server'
import { bridgeDelete, bridgeGet, bridgePatch } from '@/lib/bridge/sync'
import { serviceUpdateSchema, type AdminService } from '@/lib/services/admin-service'

export const dynamic = 'force-dynamic'

function parseId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) {
    throw new ValidationError('Invalid service id')
  }
  return id
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminUser()
    const data = await bridgeGet<AdminService>(`/services/${parseId(params.id)}`)
    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdminUser()
    const serviceId = parseId(params.id)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = serviceUpdateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const result = await bridgePatch<{ data: AdminService; portal_synced: boolean }>(
      `/services/${serviceId}`,
      parsed.data
    )

    await revalidateCache('services')
    await logAuditEvent('settings_changed', 'system', serviceId, {
      action: 'service_updated',
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

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdminUser()
    const serviceId = parseId(params.id)

    const result = await bridgeDelete<{ id: number; portal_synced: boolean }>(
      `/services/${serviceId}`
    )

    await revalidateCache('services')
    await logAuditEvent('settings_changed', 'system', serviceId, {
      action: 'service_deleted',
      actor_id: user.id,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    return handleApiError(e)
  }
}
