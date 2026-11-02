import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { fetchAllLocations } from '@/lib/locations/fetch-all'
import { listPortalQrs } from '@/lib/qr/location-qr'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Admin QR management: every EMR location with its portal link and patient QR.
 * The QR rows live in the portal `Qr` table and are read through mcm-bridge.
 */
export async function GET() {
  try {
    await requireAdminUser()
    const admin = createAdminClient()

    const [locations, { data: links, error: linkErr }, { data: tenants, error: tenantErr }, qrs] =
      await Promise.all([
        fetchAllLocations(admin, { activeOnly: false }),
        admin.from('locations').select('id, external_location_id'),
        admin.from('tenants').select('id, name'),
        listPortalQrs(),
      ])
    if (linkErr) throw linkErr
    if (tenantErr) throw tenantErr

    const portalIdByLocation = new Map(
      (links ?? []).map((l) => [l.id as number, (l.external_location_id as number | null) ?? null])
    )
    const tenantName = new Map((tenants ?? []).map((t) => [t.id as number, t.name as string]))

    const rows = locations.map((loc) => {
      const portalId = portalIdByLocation.get(loc.id) ?? null
      const qr = portalId != null ? (qrs.get(portalId) ?? null) : null
      return {
        id: loc.id,
        title: loc.title,
        is_active: loc.is_active !== false,
        tenant_id: loc.tenant_id ?? null,
        tenant_name: loc.tenant_id != null ? (tenantName.get(loc.tenant_id) ?? null) : null,
        portal_location_id: portalId,
        qr_image_url: qr?.qrcode ?? null,
        intake_url: qr?.intake_url ?? null,
        qr_created_at: qr?.created_at ?? null,
      }
    })

    return NextResponse.json({ rows })
  } catch (e) {
    return handleApiError(e)
  }
}
