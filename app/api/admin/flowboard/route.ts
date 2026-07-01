import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { buildFlowboardRows } from '@/lib/locations/flowboard-data'
import { fetchAllLocations } from '@/lib/locations/fetch-all'

export const dynamic = 'force-dynamic'

/** Read-only flowboard: all active visits at all locations (nurse-style, no doctor filter). */
export async function GET(_req: NextRequest) {
  try {
    await requireAdminUser()
    const admin = createAdminClient()
    const scope = { unrestricted: true, locationIds: [] as number[] }

    const [locations, data] = await Promise.all([
      fetchAllLocations(admin),
      buildFlowboardRows(admin, scope, { mode: 'nurse' }),
    ])

    return NextResponse.json({
      data,
      locations: (locations ?? []).map((loc) => ({ id: loc.id, title: loc.title })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
