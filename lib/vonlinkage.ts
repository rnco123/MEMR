const DEFAULT_BASE_URL = 'http://localhost:3000'

function backendBaseUrl(): string {
  return process.env.VONLINKAGE_API_BASE_URL?.trim() || DEFAULT_BASE_URL
}

function apiKey(): string {
  const key = process.env.VONLINKAGE_API_KEY?.trim()
  if (!key) {
    throw new Error('VONLINKAGE_API_KEY is not set in .env.local')
  }
  return key
}

interface BackendError {
  readonly code: string
  readonly message: string
  readonly details?: string[]
}

export interface BackendResult<T> {
  readonly status: number
  readonly ok: boolean
  readonly data: T | null
  readonly error: BackendError | null
}

/**
 * Server-side only: calls the VonLinkage API with the tenant API key and
 * unwraps its { success, data } / { success, error } envelope. Never import
 * this from a client component — the API key must not reach the browser.
 */
export async function vonlinkageFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<BackendResult<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey()}`,
  }
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (init.idempotencyKey) {
    headers['Idempotency-Key'] = init.idempotencyKey
  }

  let response: Response
  try {
    response = await fetch(`${backendBaseUrl()}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    })
  } catch {
    return {
      status: 502,
      ok: false,
      data: null,
      error: {
        code: 'BACKEND_UNREACHABLE',
        message: `Could not reach the VonLinkage API at ${backendBaseUrl()}.`,
      },
    }
  }

  type Envelope = { success: boolean; data?: T; error?: BackendError }

  const text = await response.text()
  let parsed: Envelope | null = null
  try {
    parsed = text ? (JSON.parse(text) as Envelope) : null
  } catch {
    parsed = null
  }

  if (parsed?.success) {
    return { status: response.status, ok: true, data: parsed.data ?? (null as T), error: null }
  }

  return {
    status: response.status,
    ok: false,
    data: null,
    error: parsed?.error ?? { code: 'UNKNOWN', message: 'Unexpected response from the API.' },
  }
}

export interface VonLinkageRoom {
  readonly roomId: string
  readonly roomName: string
  readonly createdAt: string
  readonly joinUrl: string
  readonly numParticipants: number
  readonly maxParticipants: number
}

export type VonLinkageRole = 'doctor' | 'patient' | 'nurse' | 'staff' | 'interpreter' | 'observer'

/** Maps MEMR's clinical role to VonLinkage's join-token role, deciding publish/subscribe grants. */
export function toVonLinkageRole(isPhysician: boolean): VonLinkageRole {
  return isPhysician ? 'doctor' : 'nurse'
}
