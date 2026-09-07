/**
 * VonLinkage — LiveKit-backed telemedicine rooms, tokens and recordings.
 *
 * ## Why this module exists
 *
 * The patient app (MCM-Go) runs on VonLinkage. Daily.co and VonLinkage are
 * different platforms, so a patient on one and a doctor on the other can never
 * be in the same call. This is the doctor half of moving both onto VonLinkage.
 *
 * ## Credential
 *
 * A tenant API key (`vlk_…`), issued to MEMR under the *same VonLinkage tenant*
 * as MCM-Go's own key. Two keys, one tenant — deliberately not a shared secret,
 * and deliberately not the platform service JWT.
 *
 * The tenant matters more than it looks. VonLinkage namespaces room names by
 * the caller's tenant slug (`t~<slug>~appointment-123`), so agreeing with
 * MCM-Go on the name `appointment-123` is NOT sufficient — if the two apps
 * authenticated as different tenants, both calls would succeed, both would echo
 * the same room name back, and the doctor and patient would sit in two
 * different rooms. That is the exact bug this migration exists to fix, except
 * silent. Same tenant, or this does not work.
 *
 * The platform JWT was rejected: it is the operator credential (it can mint
 * keys for any tenant and escape any namespace), it would put one signing
 * secret in two repos, and platform callers bypass quota and usage attribution
 * entirely. The accepted cost is that an API key does not expire — it is
 * revoked, not aged out — so it must never leave the server and never be
 * logged.
 *
 * ## Server-only
 *
 * `VONLINKAGE_API_KEY` grants the ability to mint a join token for any identity
 * in any of this tenant's rooms. Leaking it means joining any consultation as a
 * doctor. It is read from a non-`NEXT_PUBLIC_` variable so Next.js cannot inline
 * it into a client bundle, and this module throws if it is ever imported into
 * one.
 */

// Belt-and-braces alongside the non-`NEXT_PUBLIC_` variable name: if this
// module is ever pulled into a client component, fail loudly at import rather
// than shipping a module that reaches for the key at runtime. (`server-only`
// would be the idiomatic guard, but it is not a dependency of this project and
// this needs no package.)
if (typeof window !== 'undefined') {
  throw new Error(
    'lib/vonlinkage.ts is server-only — it holds the VonLinkage API key and must never be imported into a client bundle',
  )
}

export type VonRole = 'doctor' | 'patient' | 'nurse' | 'staff' | 'interpreter' | 'observer'

/** Room lifecycle. `ENDED` is only ever returned by DELETE. */
export type RoomState = 'CREATED' | 'ACTIVE' | 'EXPIRED' | 'ENDED'

export type VonRoom = {
  roomId: string
  roomName: string
  state: RoomState
  createdAt: string
  expiresAt: string
  /** Realtime URL the client connects to. Pairs with a token from issueJoinToken. */
  joinUrl: string
  numParticipants: number
  maxParticipants: number
}

/**
 * Note there is no `url` here — the token response genuinely does not carry
 * one. The realtime URL lives on the room (`VonRoom.joinUrl`), which is why
 * callers must keep the room response rather than discarding it after create.
 */
export type VonJoinToken = {
  token: string
  identity: string
  role: VonRole
  roomName: string
  expiresAt: string
}

export type VonRecording = {
  recordingId: string
  roomName: string
  status: 'STARTING' | 'ACTIVE' | 'COMPLETED' | 'FAILED'
  startedAt: string | null
  endedAt: string | null
}

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; correlationId?: string } }

/**
 * A VonLinkage call failed. `code` is the service's stable error code —
 * `ROOM_FULL`, `ROOM_EXPIRED`, `RECORDING_ALREADY_ACTIVE` and friends — and is
 * what callers should branch on rather than the HTTP status.
 */
export class VonLinkageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly correlationId?: string,
  ) {
    super(message)
    this.name = 'VonLinkageError'
  }
}

/** Thrown when the integration is not configured, so routes fail closed rather than falling back to Daily. */
export class VonLinkageNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`VonLinkage is not configured: missing ${missing.join(', ')}`)
    this.name = 'VonLinkageNotConfiguredError'
  }
}

function readEnv(): { baseUrl: string; apiKey: string } {
  const baseUrl = (process.env.VONLINKAGE_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const apiKey = (process.env.VONLINKAGE_API_KEY ?? '').trim()

  const missing: string[] = []
  if (!baseUrl) missing.push('VONLINKAGE_BASE_URL')
  if (!apiKey) missing.push('VONLINKAGE_API_KEY')
  if (missing.length > 0) throw new VonLinkageNotConfiguredError(missing)

  return { baseUrl, apiKey }
}

export function isVonLinkageConfigured(): boolean {
  return Boolean(process.env.VONLINKAGE_BASE_URL?.trim() && process.env.VONLINKAGE_API_KEY?.trim())
}

/** Correlation ids are how a failure gets traced across MEMR, VonLinkage and LiveKit. */
export function newCorrelationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `memr-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function call<T>(
  path: string,
  init: RequestInit & { correlationId: string },
): Promise<T> {
  const { baseUrl, apiKey } = readEnv()
  const { correlationId, ...requestInit } = init

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...requestInit,
      headers: {
        // Bearer <api key>. Never logged, never returned to a client.
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'x-correlation-id': correlationId,
        ...requestInit.headers,
      },
      cache: 'no-store',
    })
  } catch {
    // A DNS failure or connection reset never reaches the envelope, so it is
    // translated into the same shape as an upstream 502.
    throw new VonLinkageError(
      'PROVIDER_UNAVAILABLE',
      'VonLinkage could not be reached',
      502,
      correlationId,
    )
  }

  // VonLinkage echoes the correlation id, and generates one when absent. Prefer
  // what came back so the id logged here is the id in the service's own logs.
  const echoed = response.headers.get('x-correlation-id') ?? correlationId

  let body: Envelope<T>
  try {
    body = (await response.json()) as Envelope<T>
  } catch {
    throw new VonLinkageError(
      'PROVIDER_UNAVAILABLE',
      `VonLinkage returned a non-JSON response (HTTP ${response.status})`,
      502,
      echoed,
    )
  }

  if (!body.success) {
    throw new VonLinkageError(
      body.error.code,
      body.error.message,
      response.status,
      body.error.correlationId ?? echoed,
    )
  }

  return body.data
}

/**
 * Create-or-return. Idempotent: an existing room comes back unchanged, which
 * replaces the get-then-create-then-patch sequence the Daily route needed.
 */
export function createRoom(
  roomName: string,
  opts: { expiresIn?: number; maxParticipants?: number } = {},
  correlationId: string = newCorrelationId(),
): Promise<VonRoom> {
  return call<VonRoom>('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      roomName,
      expiresIn: opts.expiresIn ?? 3600,
      maxParticipants: opts.maxParticipants ?? 4,
    }),
    correlationId,
  })
}

export function getRoom(roomName: string, correlationId: string = newCorrelationId()): Promise<VonRoom> {
  return call<VonRoom>(`/rooms/${encodeURIComponent(roomName)}`, { correlationId })
}

/**
 * Ends the call for everyone and destroys the room.
 *
 * Unlike the contract this migration was scoped against, `DELETE /rooms/{name}`
 * does exist, so ending a session is a real server-side action rather than a
 * client-side hang-up that leaves the room to expire.
 */
export function deleteRoom(roomName: string, correlationId: string = newCorrelationId()): Promise<VonRoom> {
  return call<VonRoom>(`/rooms/${encodeURIComponent(roomName)}`, {
    method: 'DELETE',
    correlationId,
  })
}

/**
 * Mints a join credential for one identity, in one role, in one existing room.
 *
 * The room must already exist — this will not create one — so callers must
 * create the room first. The role is signed into the token, so a client cannot
 * claim a role it was not issued; that is why the role must come from the
 * verified profile and never from a request body.
 */
export function issueJoinToken(
  roomName: string,
  params: { identity: string; role: VonRole; name?: string },
  correlationId: string = newCorrelationId(),
): Promise<VonJoinToken> {
  return call<VonJoinToken>(`/rooms/${encodeURIComponent(roomName)}/token`, {
    method: 'POST',
    body: JSON.stringify({
      identity: params.identity,
      role: params.role,
      ...(params.name ? { name: params.name } : {}),
    }),
    correlationId,
  })
}

/**
 * Starts recording the room.
 *
 * Recording is not an optional extra here: VonLinkage only transcribes a
 * *finished recording* (there is no live transcription), so no recording means
 * no clinical transcript. One recording per room — a second call is refused
 * with `RECORDING_ALREADY_ACTIVE`, which callers should treat as success.
 */
export function startRecording(
  roomName: string,
  opts: { layout?: 'grid' | 'speaker' | 'single-speaker'; audioOnly?: boolean } = {},
  correlationId: string = newCorrelationId(),
): Promise<VonRecording> {
  return call<VonRecording>(`/rooms/${encodeURIComponent(roomName)}/recordings`, {
    method: 'POST',
    body: JSON.stringify({
      layout: opts.layout ?? 'grid',
      audioOnly: opts.audioOnly ?? false,
    }),
    correlationId,
  })
}
