import 'server-only'

/**
 * Portal sync via mcm-bridge.
 *
 * Tenants and locations are created here, in the EMR, by the admin panel. The public
 * site reads from the portal project, so the bridge keeps a copy there. The bridge
 * owns both connections; this app never touches the portal directly.
 *
 * Every call is best-effort: an admin creating a location must not see a failure
 * because the portal copy could not be written. Failures are logged and returned,
 * never thrown.
 */

export type SyncResult = { ok: true; id: string } | { ok: false; reason: string }

export type TenantSyncPayload = {
  id: number
  name: string
  tenant_code: string
  is_active?: boolean
}

export type LocationSyncPayload = {
  id: number
  title: string
  tenant_id?: number | null
  location_code?: string | null
  location_group?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  opening_hours?: string | null
  google_map_url?: string | null
  is_active?: boolean
}

/** Sync is optional: without configuration the app runs, it just does not mirror. */
function bridgeConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.BRIDGE_URL?.trim().replace(/\/$/, '')
  const apiKey = process.env.BRIDGE_API_KEY?.trim()
  if (!baseUrl || !apiKey) return null
  return { baseUrl, apiKey }
}

async function post(path: string, payload: unknown, label: string): Promise<SyncResult> {
  const config = bridgeConfig()
  if (!config) {
    return { ok: false, reason: 'Bridge is not configured (BRIDGE_URL / BRIDGE_API_KEY)' }
  }

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-key': config.apiKey },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = { reason: text }
    }

    if (!response.ok) {
      const record = (body ?? {}) as { message?: unknown; error?: unknown }
      const reason = record.message ?? record.error ?? `Bridge returned ${response.status}`
      console.error(`[bridge] ${label} sync failed:`, reason)
      return { ok: false, reason: String(reason) }
    }

    // The bridge reports its own mirror failures inline rather than as an HTTP error.
    const result = body as SyncResult
    if (!result?.ok) {
      console.error(`[bridge] ${label} sync rejected:`, result?.reason)
    }
    return result
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[bridge] ${label} sync unreachable:`, reason)
    return { ok: false, reason }
  }
}

export function syncTenantToPortal(tenant: TenantSyncPayload): Promise<SyncResult> {
  return post('/tenants/sync', tenant, `tenant ${tenant.id}`)
}

export function syncLocationToPortal(location: LocationSyncPayload): Promise<SyncResult> {
  return post('/locations/sync', location, `location ${location.id}`)
}
