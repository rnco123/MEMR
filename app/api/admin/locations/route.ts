import { NextRequest, NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { revalidateCache } from '@/lib/cache'
import { logAuditEvent } from '@/lib/audit-server'
import type { AdminLocationRow } from '@/lib/locations/admin-row'
import { locationCreateSchema } from '@/lib/validation'
import { bridgeGet, bridgePost } from '@/lib/bridge/sync'

export const dynamic = 'force-dynamic'

type LocationListResponse = {
  data: AdminLocationRow[]
  total: number
  page: number
  pageSize: number
}

/**
 * Locations live behind mcm-bridge, which owns both Supabase projects. This route
 * keeps admin auth, validation, auditing and cache revalidation; the bridge does the
 * writing and keeps the portal copy in step.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminUser()

    const params = new URLSearchParams()
    for (const key of ['page', 'pageSize', 'search', 'status', 'sort'] as const) {
      const value = req.nextUrl.searchParams.get(key)
      if (value) params.set(key, value)
    }
    const tenantId = req.nextUrl.searchParams.get('tenant_id')
    if (tenantId && Number(tenantId) > 0) params.set('tenantId', tenantId)

    const suffix = params.toString() ? `?${params}` : ''
    const result = await bridgeGet<LocationListResponse>(`/locations${suffix}`)

    return NextResponse.json(result)
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

    const parsed = locationCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const result = await bridgePost<{ data: AdminLocationRow; portal_synced: boolean }>(
      '/locations',
      parsed.data
    )

    await revalidateCache('locations')
    await logAuditEvent('settings_changed', 'system', result.data.id, {
      action: 'location_created',
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
