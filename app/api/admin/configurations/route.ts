import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { bridgeGet } from '@/lib/bridge/sync'

export const dynamic = 'force-dynamic'

type ConfigurationRow = {
  location_id: number
  portal_enabled: boolean
  emr_enabled: boolean
  service_ids: number[]
}

/** Location access rules live behind mcm-bridge, which owns both projects. */
export async function GET() {
  try {
    await requireAdminUser()
    const data = await bridgeGet<ConfigurationRow[]>('/configurations')
    return NextResponse.json({ data })
  } catch (e) {
    return handleApiError(e)
  }
}
