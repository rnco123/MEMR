import 'server-only'
import { AppError } from '@/lib/api-error-handler'

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

/** Extends AppError so handleApiError preserves the bridge's status code. */
export class BridgeError extends AppError {
  constructor(message: string, status: number, details?: unknown) {
    super(message, status, 'BRIDGE_ERROR', details as Record<string, unknown> | undefined)
    this.name = 'BridgeError'
  }
}

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

/**
 * Request/response calls, for the routes that no longer touch Supabase at all.
 *
 * Unlike the sync helpers above these must surface failure: if the bridge cannot
 * create a location, the admin has to see it rather than get a silent success.
 */
async function request<T>(path: string, init: RequestInit): Promise<T> {
  const config = bridgeConfig()
  if (!config) {
    throw new BridgeError('Bridge is not configured (BRIDGE_URL / BRIDGE_API_KEY)', 500)
  }

  let response: Response
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), 'x-bridge-key': config.apiKey },
      cache: 'no-store',
    })
  } catch (err) {
    throw new BridgeError(
      `Bridge unreachable: ${err instanceof Error ? err.message : String(err)}`,
      502
    )
  }

  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { message: text }
  }

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown; error?: unknown }
    const raw = record.message ?? record.error
    const message = Array.isArray(raw)
      ? raw.join(', ')
      : typeof raw === 'string'
        ? raw
        : `Bridge request failed (${response.status})`
    throw new BridgeError(message, response.status, body)
  }

  return body as T
}

export function bridgeGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' })
}

export function bridgePost<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function bridgePatch<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function bridgeDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}
