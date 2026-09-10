import { NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { revalidateCache } from '@/lib/cache'
import { logAuditEvent } from '@/lib/audit-server'
import type { AdminLocationRow } from '@/lib/locations/admin-row'
import { locationUpdateSchema } from '@/lib/validation'
import { bridgeGet, bridgePatch } from '@/lib/bridge/sync'

export const dynamic = 'force-dynamic'

function parseId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) {
    throw new ValidationError('Invalid location id')
  }
  return id
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminUser()
    const locationId = parseId(params.id)
    const data = await bridgeGet<AdminLocationRow>(`/locations/${locationId}`)
    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdminUser()
    const locationId = parseId(params.id)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = locationUpdateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const result = await bridgePatch<{ data: AdminLocationRow; portal_synced: boolean }>(
      `/locations/${locationId}`,
      parsed.data
    )

    await revalidateCache('locations')
    await logAuditEvent('settings_changed', 'system', locationId, {
      action:
        parsed.data.is_active === false
          ? 'location_disabled'
          : parsed.data.is_active === true
            ? 'location_enabled'
            : 'location_updated',
      title: result.data.title,
      tenant_id: result.data.tenant_id,
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
