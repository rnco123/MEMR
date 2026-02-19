import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canJoinTelemedicine } from '@/lib/encounter-status'
import { config } from '@/lib/config'

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

  const supabaseServer = await createServerClient()
  const { data: { session } } = await supabaseServer.auth.getSession()
  const user = session?.user ?? null
  return user ? { user } : null
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_DAILY_API_KEY

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

    const supabase = createAdminClient()

    let body
    try {
      body = await request.json().catch(() => ({}))
    } catch {
      body = {}
    }
    const { roomName, encounterId } = body

    // For telemedicine: encounterId is required to join encounter-specific room
    if (encounterId != null) {
      const encounterIdNum = Number(encounterId)
      if (isNaN(encounterIdNum)) {
        return NextResponse.json(
          { error: 'Invalid encounter ID' },
          { status: 400 }
        )
      }

      // Get user role from profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('uid', user.id)
        .single()

      const role = profile?.role as string | null
      const isDoctor = role === 'doctor'
      const isNurse = role === 'nurse' || role === 'staff'

      if (!isDoctor && !isNurse) {
        return NextResponse.json(
          { error: 'Only doctors and nurses can join telemedicine' },
          { status: 403 }
        )
      }

      // Fetch encounter
      const { data: encounter, error: encounterError } = await supabase
        .from('encounters')
        .select('id, status, doctor_id')
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

      if (isDoctor) {
        // Doctor must be assigned to this encounter
        const { data: doctorData } = await supabase
          .from('doctors')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (!doctorData || encounter.doctor_id !== doctorData.id) {
          return NextResponse.json(
            { error: 'You are not assigned to this encounter' },
            { status: 403 }
          )
        }
      }
    }

    const roomNameToUse =
      encounterId != null ? `encounter-${encounterId}` : roomName

    const roomConfig: any = {
      privacy: 'public',
      properties: {
        enable_screenshare: true,
        enable_chat: true,
        enable_knocking: true,
        start_video_off: true,
        start_audio_off: true,
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
        }
      } catch (updateError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error updating encounter status to in_consultation:', updateError)
        }
        // Do not block room creation/return on status update failure
      }
    }

    return NextResponse.json(roomData)
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
