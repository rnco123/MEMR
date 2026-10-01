import { BridgeError, bridgePost } from '@/lib/bridge/sync'

/**
 * Daily room + join token for a clinician.
 *
 * ## Why this goes through the bridge
 *
 * The patient app reaches Daily through mcm-bridge, and the EMR used to reach it
 * directly. Two implementations of one room name is a silent-failure machine: if
 * the names drift, or the two `DAILY_API_KEY`s belong to different Daily
 * domains, both parties connect to rooms that exist and each waits alone. Not
 * hypothetical — the fallback below still reconstructs the room URL from
 * `NEXT_PUBLIC_DAILY_DOMAIN`, whose default is `demo.daily.co`, which is nobody's
 * account.
 *
 * The bridge returns the `url` Daily itself reports for the room, so the domain
 * cannot disagree with the account that created it.
 *
 * ## Why the direct path survives
 *
 * Telemedicine is clinical. Routing it through one more service means a bridge
 * outage would stop consultations, so the direct call is kept as a fallback for
 * when the bridge is unconfigured or unreachable. It is a fallback, not a second
 * supported path: it writes through a different Daily key and rebuilds the URL
 * by hand, so a consultation served by it can still land in the wrong domain.
 *
 * Once every environment has `BRIDGE_URL`, `BRIDGE_API_KEY` and a bridge holding
 * the same Daily key the EMR uses, delete `mintDirect` and let the bridge error
 * surface.
 *
 * ## What this does NOT do
 *
 * No authorization. The caller must already have established that this user may
 * join this encounter — role check, `guardEncounterAccess`, and the vitals rule
 * in `canJoinTelemedicine`. This only mints credentials, and it will mint an
 * owner token for whatever it is told.
 */

export type DailyCredentials = {
  roomName: string
  /** Daily's own URL for the room when the bridge served it. */
  roomUrl: string | undefined
  token: string | null
  /** The room object, when available, for callers that spread it into a response. */
  room: Record<string, unknown> | null
  servedBy: 'bridge' | 'direct'
}

export type MintOptions = {
  encounterId: number
  userId: string
  userName: string
  isOwner: boolean
}

/** Matches `dailyRoomNameFor` in mcm-bridge. Changing one without the other separates the parties. */
const roomNameFor = (encounterId: number) => `encounter-${encounterId}`

/**
 * Mirrored in mcm-bridge's DailyService. Only used by the fallback — the bridge
 * owns these properties on the normal path.
 */
const ROOM_PROPERTIES = {
  enable_screenshare: true,
  enable_chat: true,
  enable_knocking: true,
  enable_prejoin_ui: false,
  start_video_off: true,
  start_audio_off: true,
  enable_transcription: true,
  enable_live_captions_ui: true,
} as const

export async function mintDailyCredentials(opts: MintOptions): Promise<DailyCredentials> {
  try {
    const res = await bridgePost<{
      token: string
      url: string
      roomName: string
    }>(`/visits/encounters/${opts.encounterId}/staff-token`, {
      userId: opts.userId,
      userName: opts.userName,
      isOwner: opts.isOwner,
    })

    return {
      roomName: res.roomName,
      roomUrl: res.url,
      token: res.token,
      room: { name: res.roomName, url: res.url },
      servedBy: 'bridge',
    }
  } catch (err) {
    // Only a bridge-level failure falls back. A Daily failure reported *through*
    // the bridge is a real failure and must not be retried against a second
    // account — that is how a patient and a doctor end up in two rooms.
    if (!(err instanceof BridgeError)) throw err
    if (process.env.NODE_ENV === 'development') {
      console.warn('[daily] bridge unavailable, falling back to direct Daily:', err.message)
    }
    return mintDirect(opts)
  }
}

/** The pre-bridge path, kept verbatim in behaviour. See the note above. */
async function mintDirect(opts: MintOptions): Promise<DailyCredentials> {
  const apiKey = process.env.DAILY_API_KEY || process.env.NEXT_PUBLIC_DAILY_API_KEY
  if (!apiKey) throw new Error('Daily.co API key not configured')

  const roomName = roomNameFor(opts.encounterId)
  const auth = { Authorization: `Bearer ${apiKey}` }

  let room: Record<string, unknown> | null = null

  const existing = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
    headers: auth,
  })
  if (existing.ok) room = await existing.json()

  if (!room) {
    const created = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: roomName, privacy: 'public', properties: ROOM_PROPERTIES }),
    })
    if (created.ok) {
      room = await created.json()
    } else {
      // A concurrent create by the other party is a success, not a failure.
      const again = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
        headers: auth,
      })
      if (!again.ok) {
        throw new Error(`Failed to create Daily.co room: ${await created.text()}`)
      }
      room = await again.json()
    }
  }

  // Rooms made before transcription was enabled keep the old config, so captions
  // would be missing for the whole call.
  const props =
    ((room?.config as { properties?: Record<string, unknown> } | undefined)?.properties ??
      (room?.properties as Record<string, unknown> | undefined) ??
      {}) as Record<string, unknown>
  if (props.enable_transcription !== true || props.enable_prejoin_ui !== false) {
    const patched = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { ...props, ...ROOM_PROPERTIES } }),
    })
    if (patched.ok) room = await patched.json()
  }

  const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60
  const tokenRes = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_id: opts.userId.slice(0, 36),
        user_name: opts.userName,
        is_owner: opts.isOwner,
        exp,
      },
    }),
  })

  let token: string | null = null
  if (tokenRes.ok) {
    token = ((await tokenRes.json()) as { token?: string }).token ?? null
  } else if (process.env.NODE_ENV === 'development') {
    console.error('Daily meeting-token error:', tokenRes.status, await tokenRes.text())
  }

  // Reconstructed rather than taken from Daily, which is the flaw this fallback
  // inherits: an unset NEXT_PUBLIC_DAILY_DOMAIN points every call at demo.daily.co.
  const rawDomain = (process.env.NEXT_PUBLIC_DAILY_DOMAIN || '').trim() || 'demo.daily.co'
  const dailyDomain = rawDomain.includes('.daily.co') ? rawDomain : `${rawDomain}.daily.co`

  return {
    roomName,
    roomUrl: `https://${dailyDomain}/${roomName}`,
    token,
    room,
    servedBy: 'direct',
  }
}
