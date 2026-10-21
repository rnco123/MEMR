import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error-handler'
import { fetchTenantLocationIds, requireClinicManager } from '@/lib/manage/auth'
import { buildFlowboardRows } from '@/lib/locations/flowboard-data'

export const dynamic = 'force-dynamic'

/** Read-only flowboard for a clinic manager: active visits at their tenant's locations. */
export async function GET() {
  try {
    const { tenantId, admin } = await requireClinicManager()
    const locationIds = [...(await fetchTenantLocationIds(admin, tenantId))]
    if (locationIds.length === 0) return NextResponse.json({ data: [], locations: [] })

    const [{ data: locations, error }, data] = await Promise.all([
      admin.from('locations').select('id, title').in('id', locationIds).eq('is_active', true).order('title'),
      buildFlowboardRows(admin, { unrestricted: false, locationIds }, { mode: 'nurse' }),
    ])
    if (error) throw error

    return NextResponse.json({ data, locations: locations ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}
