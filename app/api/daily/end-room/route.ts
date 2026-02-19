import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_DAILY_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
        { status: 500 }
      )
    }

    const supabaseServer = await createServerClient()
    const { data: { session } } = await supabaseServer.auth.getSession()
    const user = session?.user ?? null

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

    // Optional: only doctors/nurses can end telemedicine rooms
    const { data: profile } = await supabaseServer
      .from('profiles')
      .select('role')
      .eq('uid', user.id)
      .maybeSingle()

    const role = profile?.role as string | null
    if (!role || !['doctor', 'nurse', 'staff'].includes(role)) {
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
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

