import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canJoinTelemedicine } from '@/lib/encounter-status'
import { getProfileId, insertStatusTimeline } from '@/lib/status-timeline'
import { config } from '@/lib/config'
import { guardEncounterAccess } from '@/lib/encounters/guard'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { resolveClinicalApiRole } from '@/lib/locations/scope'
import { UserRole, isPhysicianRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

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

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.DAILY_API_KEY || process.env.NEXT_PUBLIC_DAILY_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
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
    const { roomName, encounterId } = body

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
      .select('id, status')
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

    const roomNameToUse = `encounter-${encounterId}`

    const roomConfig: any = {
      privacy: 'public',
      properties: {
        enable_screenshare: true,
        enable_chat: true,
        enable_knocking: true,
        enable_prejoin_ui: false,
        start_video_off: true,
        start_audio_off: true,
        enable_transcription: true,
        enable_live_captions_ui: true,
      },
    }

    if (roomNameToUse) {
      roomConfig.name = roomNameToUse
    }

    // Try to get existing room first (for encounter-specific rooms)
    let roomData: any = null
    if (roomNameToUse) {
      const getResponse = await fetch(
        `https://api.daily.co/v1/rooms/${roomNameToUse}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      )
      if (getResponse.ok) {
        roomData = await getResponse.json()
      }
    }

    if (!roomData) {
      const response = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(roomConfig),
      })

      if (!response.ok) {
        const errorText = await response.text()
        const isRoomExists =
          response.status === 400 &&
          (errorText.includes('already exists') || errorText.includes('invalid-request-error'))

        if (isRoomExists && roomNameToUse) {
          const getResponse = await fetch(
            `https://api.daily.co/v1/rooms/${roomNameToUse}`,
            { headers: { Authorization: `Bearer ${apiKey}` } }
          )
          if (getResponse.ok) {
            roomData = await getResponse.json()
          }
        }

        if (!roomData) {
          return NextResponse.json(
            { error: 'Failed to create Daily.co room', details: errorText },
            { status: response.status }
          )
        }
      } else {
        roomData = await response.json()
      }
    }

    // Rooms created before transcription was enabled keep old config — merge so captions/transcription work.
    if (roomNameToUse && roomData) {
      const existingProps =
        (roomData.config && roomData.config.properties) ||
        roomData.properties ||
        {}
      const needsConfigPatch =
        existingProps.enable_transcription !== true ||
        existingProps.enable_prejoin_ui !== false
      if (needsConfigPatch) {
        const patchRes = await fetch(
          `https://api.daily.co/v1/rooms/${encodeURIComponent(roomNameToUse)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              properties: {
                ...existingProps,
                enable_screenshare: true,
                enable_chat: true,
                enable_knocking: true,
                enable_prejoin_ui: false,
                start_video_off: true,
                start_audio_off: true,
                enable_transcription: true,
                enable_live_captions_ui: true,
              },
            }),
          }
        )
        if (patchRes.ok) {
          roomData = await patchRes.json()
        } else if (process.env.NODE_ENV === 'development') {
          const errText = await patchRes.text()
          console.error('[daily/room] Could not enable transcription on room', roomNameToUse, errText)
        }
      }
    }

    // If this is tied to an encounter, move status to in_consultation
    if (encounterId != null) {
      try {
        const encounterIdNum = Number(encounterId)
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

    // Generate a meeting token for SDK usage (profiles.id then uid)
    let profileForToken: { full_name?: string | null; role?: string } | null = null
    const profileById = await supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle()
    if (profileById.data) profileForToken = profileById.data
    if (!profileForToken) {
      const profileByUid = await supabase.from('profiles').select('full_name, role').eq('uid', user.id).maybeSingle()
      if (profileByUid.data) profileForToken = profileByUid.data
    }

    const userRole = (profileForToken?.role as string) ?? ''
    const displayName = isPhysicianRole(userRole)
      ? 'Doctor'
      : userRole === 'nurse' || userRole === 'staff'
        ? 'Nurse'
        : 'Staff'
    const userName = profileForToken?.full_name || displayName

    // Meeting token: room_name required; exp recommended by Daily
    const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60 // 2 hours
    const tokenPayload = {
      properties: {
        room_name: roomData.name,
        user_id: user.id.slice(0, 36), // Daily limit 36 chars
        user_name: userName ?? undefined,
        is_owner: isPhysicianRole(userRole),
        exp,
      },
    }

    const tokenResponse = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(tokenPayload),
    })

    let token: string | null = null
    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json()
      token = tokenData.token ?? null
    } else if (process.env.NODE_ENV === 'development') {
      const errText = await tokenResponse.text()
      console.error('Daily meeting-token error:', tokenResponse.status, errText)
    }

    // Build room URL with same domain as backend (so client joins the account that created the room)
    const rawDomain = (process.env.NEXT_PUBLIC_DAILY_DOMAIN || '').trim() || 'demo.daily.co'
    const dailyDomain = rawDomain.includes('.daily.co') ? rawDomain : `${rawDomain}.daily.co`
    const roomUrl = roomData.name ? `https://${dailyDomain}/${roomData.name}` : undefined

    return NextResponse.json({
      ...roomData,
      token, // Include token for SDK usage
      room_url: roomUrl, // Use this URL on the client so domain matches the account that created the room
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
