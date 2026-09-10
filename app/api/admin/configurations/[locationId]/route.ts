import { NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { revalidateCache } from '@/lib/cache'
import { logAuditEvent } from '@/lib/audit-server'
import { bridgeGet, bridgePut } from '@/lib/bridge/sync'

export const dynamic = 'force-dynamic'

type ConfigurationRow = {
  location_id: number
  portal_enabled: boolean
  emr_enabled: boolean
  service_ids: number[]
}

const saveSchema = z.object({
  portal_enabled: z.boolean(),
  emr_enabled: z.boolean(),
  service_ids: z.array(z.number().int().positive()),
})

function parseId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid location id')
  return id
}

export async function GET(_request: Request, { params }: { params: { locationId: string } }) {
  try {
    await requireAdminUser()
    const data = await bridgeGet<ConfigurationRow>(`/configurations/${parseId(params.locationId)}`)
    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(request: Request, { params }: { params: { locationId: string } }) {
  try {
    const user = await requireAdminUser()
    const locationId = parseId(params.locationId)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = saveSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const result = await bridgePut<{ data: ConfigurationRow; portal_synced: boolean }>(
      `/configurations/${locationId}`,
      // Duplicates would be rejected downstream; collapse them here so a repeated
      // click in the UI cannot fail the save.
      { ...parsed.data, service_ids: [...new Set(parsed.data.service_ids)] }
    )

    await revalidateCache('services')
    await logAuditEvent('settings_changed', 'system', locationId, {
      action: 'location_configuration_saved',
      portal_enabled: result.data.portal_enabled,
      emr_enabled: result.data.emr_enabled,
      service_count: result.data.service_ids.length,
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
