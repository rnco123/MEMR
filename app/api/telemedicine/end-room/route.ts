import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isClinicalStaffRole } from '@/lib/roles'
import { config } from '@/lib/config'
import { POST as dailyEndRoomHandler } from '@/app/api/daily/end-room/route'
import {
  deleteRoom,
  newCorrelationId,
  isVonLinkageConfigured,
  VonLinkageError,
} from '@/lib/vonlinkage'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Mirrors the join route's dispatch so a rollback flips both halves together.
  if (config.telemedicine.provider === 'daily') {
    return dailyEndRoomHandler(request)
  }
  return handleVonLinkage(request)
}

async function handleVonLinkage(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id')?.trim() || newCorrelationId()

  try {
    // Fail closed rather than reporting success for a room that was never ended.
    if (!isVonLinkageConfigured()) {
      console.error('[telemedicine/end-room] VonLinkage is not configured', { correlationId })
      return NextResponse.json(
        { error: 'Telemedicine provider is not configured', correlationId },
        { status: 500 }
      )
    }

    // M-04b: Use getUser() for verified auth — avoids trusting unverified client-side JWT.
    const supabaseServer = await createServerClient()
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body
    try {
      body = await request.json().catch(() => ({}))
    } catch {
      body = {}
    }

    const { encounterId } = body

    if (encounterId == null) {
      return NextResponse.json(
        { error: 'encounterId is required' },
        { status: 400 }
      )
    }

    const encounterIdNum = Number(encounterId)
    if (isNaN(encounterIdNum)) {
      return NextResponse.json(
        { error: 'Invalid encounter ID' },
        { status: 400 }
      )
    }

    // Resolve profile: try id first (newer schema), fallback to uid
    let profileData: { role?: string } | null = null
    const byId = await supabaseServer.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (byId.data) profileData = byId.data
    if (!profileData) {
      const byUid = await supabaseServer.from('profiles').select('role').eq('uid', user.id).maybeSingle()
      if (byUid.data) profileData = byUid.data
    }

    const role = profileData?.role as string | null
    if (!isClinicalStaffRole(role)) {
      return NextResponse.json(
        { error: 'Not allowed to end telemedicine session' },
        { status: 403 }
      )
    }

    // Same appointment-keyed name the join route builds — ending a room named
    // any other way would leave the real call running.
    const admin = createAdminClient()
    const { data: encounter, error: encounterError } = await admin
      .from('encounters')
      .select('id, appointment_id')
      .eq('id', encounterIdNum)
      .single()

    if (encounterError || !encounter) {
      return NextResponse.json({ error: 'Encounter not found' }, { status: 404 })
    }

    if (encounter.appointment_id == null) {
      return NextResponse.json(
        { error: 'This encounter has no appointment, so it has no telemedicine room' },
        { status: 409 }
      )
    }

    const roomName = `appointment-${encounter.appointment_id}`

    // Destroying the room ends the call for everyone and stops the recording,
    // which is what starts transcription. Best-effort: a room that is already
    // gone is the desired end state, not an error worth failing the request on.
    try {
      await deleteRoom(roomName, correlationId)
    } catch (deleteError) {
      const alreadyGone =
        deleteError instanceof VonLinkageError &&
        (deleteError.code === 'ROOM_NOT_FOUND' || deleteError.code === 'ROOM_EXPIRED')

      if (!alreadyGone) {
        console.error('[telemedicine/end-room] Could not delete room', {
          roomName,
          correlationId,
          code: deleteError instanceof VonLinkageError ? deleteError.code : 'UNKNOWN',
        })
        Sentry.captureException(deleteError, {
          tags: { route: 'telemedicine-end-room' },
          extra: { correlationId, roomName },
        })
        return NextResponse.json(
          {
            success: false,
            warning: 'Room delete failed',
            code: deleteError instanceof VonLinkageError ? deleteError.code : undefined,
            correlationId,
          },
          { status: 200 }
        )
      }
    }

    return NextResponse.json({ success: true, correlationId })
  } catch (error) {
    console.error('[telemedicine/end-room]', error)
    Sentry.captureException(error, {
      tags: { route: 'telemedicine-end-room' },
      extra: { correlationId },
    })
    return NextResponse.json(
      { error: 'Internal server error', correlationId },
      { status: 500 }
    )
  }
}
