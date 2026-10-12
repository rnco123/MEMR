import { NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { logAuditEvent } from '@/lib/audit-server'
import { bridgePatch } from '@/lib/bridge/sync'
import { revalidateCache } from '@/lib/cache'
import type { AdminLocationRow } from '@/lib/locations/admin-row'
import { fetchTenantLocationIds, requireClinicManager } from '@/lib/manage/auth'
import { locationUpdateSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

// A manager cannot move a location to another tenant.
const manageLocationUpdateSchema = locationUpdateSchema.omit({ tenant_id: true, location_group: true })

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, tenantId, admin } = await requireClinicManager()
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid location id')

    const own = await fetchTenantLocationIds(admin, tenantId)
    if (!own.has(id)) throw new ValidationError('Location not found')

    const parsed = manageLocationUpdateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid input')

    const result = await bridgePatch<{ data: AdminLocationRow }>(`/locations/${id}`, parsed.data)

    await revalidateCache('locations')
    await logAuditEvent('settings_changed', 'system', id, {
      action: 'location_updated',
      source: 'clinic_manager',
      tenant_id: tenantId,
      fields: Object.keys(parsed.data),
      actor_id: user.id,
    })

    return NextResponse.json({ success: true, data: result.data })
  } catch (e) {
    return handleApiError(e)
  }
}
