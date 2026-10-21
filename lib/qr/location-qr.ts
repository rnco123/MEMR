import 'server-only'
import { ValidationError } from '@/lib/api-error-handler'
import { BridgeError, bridgeGet, bridgePost } from '@/lib/bridge/sync'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Patient check-in QR codes for a location. mcm-bridge makes the PNG, stores it in the
 * portal's `new_qr` bucket and writes the portal `Qr` row (keyed by the portal location
 * id); qr-csm reads the same row. The code opens CSA intake for that location.
 */
export type LocationQr = {
  id: number
  locationid: number
  locationtitle: string
  qrcode: string | null
  created_at: string
}

export type LocationQrResult = {
  /** Portal `Locations.id` the QR belongs to; null while the location is not synced. */
  portal_location_id: number | null
  data: LocationQr | null
}

async function portalIdFor(admin: ReturnType<typeof createAdminClient>, emrLocationId: number): Promise<number | null> {
  const { data, error } = await admin
    .from('locations')
    .select('external_location_id')
    .eq('id', emrLocationId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new ValidationError('Location not found')
  return (data.external_location_id as number | null) ?? null
}

export async function getLocationQr(
  admin: ReturnType<typeof createAdminClient>,
  emrLocationId: number
): Promise<LocationQrResult> {
  const portalId = await portalIdFor(admin, emrLocationId)
  if (portalId == null) return { portal_location_id: null, data: null }
  try {
    const res = await bridgeGet<{ data: LocationQr }>(`/qr/locations/${portalId}`)
    return { portal_location_id: portalId, data: res.data }
  } catch (e) {
    if (e instanceof BridgeError && e.statusCode === 404) return { portal_location_id: portalId, data: null }
    throw e
  }
}

/**
 * Creates the QR when missing; returns the existing one otherwise (never replaced).
 * A location not yet in the portal is added there first by the bridge, so this
 * works for every EMR location.
 */
export async function generateLocationQr(
  admin: ReturnType<typeof createAdminClient>,
  emrLocationId: number
): Promise<LocationQrResult> {
  await portalIdFor(admin, emrLocationId) // 400s an unknown location before calling out
  return bridgePost<LocationQrResult>(`/locations/${emrLocationId}/qr`, {})
}

export type PortalQrRow = LocationQr & {
  /** The CSA intake link the QR encodes; null when the bridge has no QR_BASE_URL. */
  intake_url: string | null
}

/** Every portal QR row, keyed by portal location id. */
export async function listPortalQrs(): Promise<Map<number, PortalQrRow>> {
  const res = await bridgeGet<{ data: PortalQrRow[] }>('/qr/locations')
  return new Map((res.data ?? []).map((row) => [row.locationid, row]))
}

export function parseLocationId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid location id')
  return id
}
