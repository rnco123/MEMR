import { NextResponse } from 'next/server'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { logAuditEvent } from '@/lib/audit-server'
import { bridgePost } from '@/lib/bridge/sync'
import { revalidateCache } from '@/lib/cache'
import type { AdminLocationRow } from '@/lib/locations/admin-row'
import { requireClinicManager } from '@/lib/manage/auth'
import { locationCreateSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/** Tenant is always the manager's own; it is never taken from the request. */
const manageLocationCreateSchema = locationCreateSchema.omit({ tenant_id: true, location_group: true })

export async function GET() {
  try {
    const { tenantId, admin } = await requireClinicManager()
    const { data, error } = await admin
      .from('locations')
      .select('id, title, address, phone, email, opening_hours, is_active, updated_at')
      .eq('tenant_id', tenantId)
      .order('title')
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (e) {
    return handleApiError(e)
  }
}

/** Create a location under the manager's tenant, through mcm-bridge like Admin → Locations. */
export async function POST(request: Request) {
  try {
    const { user, tenantId } = await requireClinicManager()
    const parsed = manageLocationCreateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid input')

    const result = await bridgePost<{ data: AdminLocationRow }>('/locations', {
      ...parsed.data,
      tenant_id: tenantId,
    })

    await revalidateCache('locations')
    await logAuditEvent('settings_changed', 'system', result.data.id, {
      action: 'location_created',
      source: 'clinic_manager',
      title: result.data.title,
      tenant_id: tenantId,
      actor_id: user.id,
    })

    return NextResponse.json({ success: true, data: result.data })
  } catch (e) {
    return handleApiError(e)
  }
}
