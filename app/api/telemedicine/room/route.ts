import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canJoinTelemedicine } from '@/lib/encounter-status'
import { getProfileId, insertStatusTimeline } from '@/lib/status-timeline'
import { config } from '@/lib/config'
import { guardEncounterAccess } from '@/lib/encounters/guard'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { resolveClinicalApiRole } from '@/lib/locations/scope'
import { UserRole, isPhysicianRole } from '@/lib/roles'
import { auditPhi } from '@/lib/audit-phi'
import {
  createRoom,
  issueJoinToken,
  startRecording,
  newCorrelationId,
  isVonLinkageConfigured,
  VonLinkageError,
  type VonRole,
} from '@/lib/vonlinkage'

export const dynamic = 'force-dynamic'

/**
 * How long a consultation room stays joinable. Four hours comfortably covers a
 * long visit plus a doctor rejoining after a dropped connection, and sits well
 * under VonLinkage's 12-hour ceiling.
 */
const ROOM_TTL_SECONDS = 4 * 60 * 60

async function getUserFromRequest(request: Request): Promise<{ user: { id: string } } | null> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (token) {
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user) return { user }
  }

  // M-04b: Use getUser() for verified server-side auth.
  const supabaseServer = await createServerClient()
  const { data: { user }, error } = await supabaseServer.auth.getUser()
  if (error || !user) return null
  return { user }
}

/**
 * Clinical role -> VonLinkage participant role.
 *
 * The argument is the role already resolved from the verified profile — never
 * anything off the request body, since the role is signed into the join token
 * and decides what the holder may do in the room.
 */
function toVonRole(clinicalRole: UserRole | null): VonRole {
  return isPhysicianRole(clinicalRole) ? 'doctor' : 'nurse'
}

/** Joins a telemedicine call. VonLinkage is the only provider. */
export async function POST(request: NextRequest) {
  // Forwarded to VonLinkage and logged on every failure — this is how a broken
  // call gets traced across MEMR, VonLinkage and LiveKit.
  const correlationId = request.headers.get('x-correlation-id')?.trim() || newCorrelationId()

  try {
    // Fail closed: a misconfigured VonLinkage surfaces as an error rather than
    // a half-working call.
    if (!isVonLinkageConfigured()) {
      console.error('[telemedicine/room] VonLinkage is not configured', { correlationId })
      return NextResponse.json(
        { error: 'Telemedicine provider is not configured', correlationId },
        { status: 500 }
      )
    }

    const authResult = await getUserFromRequest(request)
    const user = authResult?.user ?? null

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body
    try {
      body = await request.json().catch(() => ({}))
    } catch {
      body = {}
    }
    const { encounterId } = body

    // L-04: Telemedicine requires a specific encounter; nurses cannot join arbitrary rooms.
    if (encounterId == null) {
      return NextResponse.json(
        { error: 'encounterId is required for telemedicine' },
        { status: 400 }
      )
    }

    const encounterIdNum = Number(encounterId)
    if (Number.isNaN(encounterIdNum)) {
      return NextResponse.json(
        { error: 'Invalid encounter ID' },
        { status: 400 }
      )
    }

    const roleInfo = await fetchUserRole(await createServerClient(), user.id)
    const clinicalRole = resolveClinicalApiRole(roleInfo?.role)
    if (!isPhysicianRole(clinicalRole) && clinicalRole !== UserRole.NURSE) {
      return NextResponse.json(
        { error: 'Only physicians and nurses can join telemedicine' },
        { status: 403 }
      )
    }

    await guardEncounterAccess(user.id, encounterIdNum, {
      requireDoctorAssignment: isPhysicianRole(clinicalRole),
    })

    const supabase = createAdminClient()

    const { data: encounter, error: encounterError } = await supabase
      .from('encounters')
      .select('id, status, appointment_id')
      .eq('id', encounterIdNum)
      .single()

    if (encounterError || !encounter) {
      return NextResponse.json(
        { error: 'Encounter not found' },
        { status: 404 }
      )
    }

    if (!canJoinTelemedicine(encounter.status)) {
      return NextResponse.json(
        { error: 'Vitals must be assessed before joining telemedicine' },
        { status: 403 }
      )
    }

    // The room is keyed on the APPOINTMENT, not the encounter, because that is
    // the only id both sides can name. Encounters are created by clinic staff
    // after the patient has already booked, so a patient can never know one —
    // keying on it would make the room unnameable from the patient app.
    //
    // No fallback name. An encounter with no appointment cannot be joined by a
    // patient at all, and inventing a name would put the doctor alone in a room
    // the patient will never enter — two empty rooms instead of one visible
    // error.
    if (encounter.appointment_id == null) {
      return NextResponse.json(
        {
          error:
            'This encounter has no appointment, so it has no telemedicine room the patient can join',
        },
        { status: 409 }
      )
    }

    const roomName = `appointment-${encounter.appointment_id}`

    // Idempotent: an existing room comes back unchanged.
    //
    // The TTL is set explicitly rather than inherited. VonLinkage's default is
    // one hour, and because create is idempotent an existing room's deadline
    // cannot be extended by calling again — a consultation that runs past it is
    // dropped and rejoining fails with ROOM_EXPIRED.
    const room = await createRoom(roomName, { expiresIn: ROOM_TTL_SECONDS }, correlationId)

    // Recording is the transcript. VonLinkage has no live transcription — it
    // transcribes a *finished recording* — so a consult that is not recorded
    // has no clinical transcript at all.
    //
    // Deliberately non-fatal: a doctor being unable to see the patient is worse
    // than a missing transcript, so a failure here is reported to the caller
    // rather than blocking the visit. `RECORDING_ALREADY_ACTIVE` is the normal
    // response when someone rejoins and is treated as success.
    let recordingStarted = true
    try {
      await startRecording(roomName, {}, correlationId)
    } catch (recordingError) {
      const alreadyActive =
        recordingError instanceof VonLinkageError &&
        recordingError.code === 'RECORDING_ALREADY_ACTIVE'
      if (!alreadyActive) {
        recordingStarted = false
        console.error('[telemedicine/room] Could not start recording', {
          roomName,
          correlationId,
          code: recordingError instanceof VonLinkageError ? recordingError.code : 'UNKNOWN',
        })
        Sentry.captureException(recordingError, {
          tags: { route: 'telemedicine-room', stage: 'start-recording' },
          extra: { correlationId, roomName },
        })
      }
    }

    // If this is tied to an encounter, move status to in_consultation
    if (encounterId != null) {
      try {
        if (!isNaN(encounterIdNum)) {
          await supabase
            .from('encounters')
            .update({
              status: 'in_consultation',
              updated_at: new Date().toISOString(),
            })
            .eq('id', encounterIdNum)
          const profileId = await getProfileId(supabase, user.id)
          await insertStatusTimeline(supabase, {
            encounterId: encounterIdNum,
            status: 'in_consultation',
            profileId,
          })
        }
      } catch (updateError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error updating encounter status to in_consultation:', updateError)
        }
        // Do not block room creation/return on status update failure
      }
    }

    // Display name only (profiles.id then uid). The ROLE comes from the
    // verified clinical role resolved above, never from this row's free-text
    // `role` column and never from the request.
    let profileForToken: { full_name?: string | null } | null = null
    const profileById = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    if (profileById.data) profileForToken = profileById.data
    if (!profileForToken) {
      const profileByUid = await supabase.from('profiles').select('full_name').eq('uid', user.id).maybeSingle()
      if (profileByUid.data) profileForToken = profileByUid.data
    }

    const vonRole = toVonRole(clinicalRole)

    // Stable per-user identity. A second connection with the same identity
    // evicts the first, which is what should happen when a doctor rejoins after
    // a dropped connection.
    const identity = `${vonRole}-${user.id}`
    const displayName =
      profileForToken?.full_name || (vonRole === 'doctor' ? 'Doctor' : 'Nurse')

    const joinToken = await issueJoinToken(
      roomName,
      { identity, role: vonRole, name: displayName },
      correlationId
    )

    auditPhi({
      user,
      role: roleInfo?.role,
      action: 'video_session_started',
      resourceType: 'encounter',
      resourceId: encounterIdNum,
      request,
    })

    return NextResponse.json({
      token: joinToken.token,
      // The token response carries no URL — the realtime URL lives on the room.
      url: room.joinUrl,
      roomName: joinToken.roomName,
      identity: joinToken.identity,
      role: joinToken.role,
      expiresAt: joinToken.expiresAt,
      // Surfaced so the UI can tell the clinician no transcript will exist for
      // this visit, rather than discovering it afterwards.
      recordingStarted,
      correlationId,
    })
  } catch (error) {
    if (error instanceof VonLinkageError) {
      // The service's own codes are more useful to the caller than a blanket
      // 500, and the correlation id is what makes the failure traceable.
      console.error('[telemedicine/room] VonLinkage error', {
        code: error.code,
        status: error.status,
        correlationId: error.correlationId ?? correlationId,
      })
      Sentry.captureException(error, {
        tags: { route: 'telemedicine-room', vonlinkageCode: error.code },
        extra: { correlationId: error.correlationId ?? correlationId },
      })
      return NextResponse.json(
        {
          error: 'Could not start the telemedicine session',
          code: error.code,
          correlationId: error.correlationId ?? correlationId,
        },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 }
      )
    }

    console.error('[telemedicine/room]', error)
    Sentry.captureException(error, {
      tags: { route: 'telemedicine-room' },
      extra: { correlationId },
    })
    return NextResponse.json(
      { error: 'Internal server error', correlationId },
      { status: 500 }
    )
  }
}
