import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isClinicalStaffRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.DAILY_API_KEY || process.env.NEXT_PUBLIC_DAILY_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
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

    const roomName = `encounter-${encounterIdNum}`

    // Best-effort delete: if the room doesn't exist, ignore the error
    const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok && response.status !== 404) {
      const text = await response.text().catch(() => '')
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to delete Daily.co room:', response.status, text)
      }
      // Don't treat as fatal; just return a warning
      return NextResponse.json(
        { success: false, warning: 'Room delete failed', status: response.status },
        { status: 200 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[daily/end-room]', error)
    Sentry.captureException(error, { tags: { route: 'daily-end-room' } })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

