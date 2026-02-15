// Daily.co utility functions
// Note: DailyIframe.createFrame is used directly in components

export async function createDailyRoomToken(roomUrl: string, userId?: string) {
  const apiKey = process.env.NEXT_PUBLIC_DAILY_API_KEY
  const domain = process.env.NEXT_PUBLIC_DAILY_DOMAIN

  if (!apiKey || !domain) {
    throw new Error('Daily.co API key or domain not configured')
  }

  const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      properties: {
        room_name: roomUrl,
        user_id: userId || 'anonymous',
      },
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to create Daily.co token')
  }

  const data = await response.json()
  return data.token
}

export async function createDailyRoom(roomName?: string) {
  const apiKey = process.env.NEXT_PUBLIC_DAILY_API_KEY
  const domain = process.env.NEXT_PUBLIC_DAILY_DOMAIN

  if (!apiKey || !domain) {
    throw new Error('Daily.co API key or domain not configured')
  }

  const response = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      name: roomName,
      privacy: 'public',
      properties: {
        enable_screenshare: true,
        enable_chat: true,
        enable_knocking: true,
      },
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to create Daily.co room')
  }

  const data = await response.json()
  return data
}
