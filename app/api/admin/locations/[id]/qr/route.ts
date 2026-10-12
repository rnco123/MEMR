import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { logAuditEvent } from '@/lib/audit-server'
import { generateLocationQr, getLocationQr, parseLocationId } from '@/lib/qr/location-qr'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminUser()
    return NextResponse.json(await getLocationQr(createAdminClient(), parseLocationId(params.id)))
  } catch (e) {
    return handleApiError(e)
  }
}

/** Generate the location's patient QR through mcm-bridge (adds the portal Qr row). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdminUser()
    const locationId = parseLocationId(params.id)
    const result = await generateLocationQr(createAdminClient(), locationId)
    await logAuditEvent('settings_changed', 'system', locationId, {
      action: 'location_qr_generated',
      portal_location_id: result.portal_location_id,
      actor_id: user.id,
    })
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e)
  }
}
