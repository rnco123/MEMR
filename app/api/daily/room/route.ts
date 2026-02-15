import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_DAILY_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
        { status: 500 }
      )
    }

    let body
    try {
      body = await request.json().catch(() => ({}))
    } catch {
      body = {}
    }
    const { roomName } = body

    const roomConfig: any = {
      privacy: 'public',
      properties: {
        enable_screenshare: true,
        enable_chat: true,
        enable_knocking: true,
        start_video_off: false,
        start_audio_off: false,
      },
    }

    if (roomName) {
      roomConfig.name = roomName
    }

    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(roomConfig),
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json(
        { error: 'Failed to create Daily.co room', details: error },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
