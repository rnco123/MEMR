import { NextResponse } from 'next/server'
import { config } from '@/lib/config'

/**
 * Test Daily.co API connection endpoint
 * SECURITY: This endpoint should be disabled in production or secured with IP whitelisting
 */
export async function GET() {
  // Disable in production unless explicitly enabled
  if (config.app.isProduction && process.env.ENABLE_TEST_ENDPOINTS !== 'true') {
    return NextResponse.json(
      { error: 'Test endpoints are disabled in production' },
      { status: 403 }
    )
  }

  try {
    const apiKey = config.daily.apiKey
    const domain = config.daily.domain

    if (!apiKey || !domain) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Daily.co credentials not configured',
          details: {
            hasApiKey: !!apiKey,
            hasDomain: !!domain
          }
        },
        { status: 400 }
      )
    }

    // Test Daily.co API by fetching account info or listing rooms
    const response = await fetch('https://api.daily.co/v1/', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { 
          success: false, 
          error: 'Daily.co API request failed',
          status: response.status,
          details: config.app.isDevelopment ? errorText : undefined
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Also try to create a test room to verify full functionality
    const roomResponse = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: `test-room-${Date.now()}`,
        privacy: 'public',
        properties: {
          enable_screenshare: true,
          enable_chat: true,
        },
      }),
    })

    let roomData = null
    if (roomResponse.ok) {
      roomData = await roomResponse.json()
    }

    return NextResponse.json({
      success: true,
      message: 'Daily.co API is working correctly',
      accountInfo: data,
      testRoom: roomData ? {
        url: roomData.url,
        name: roomData.name,
        id: roomData.id
      } : null,
      credentials: {
        apiKeyConfigured: !!apiKey,
        domainConfigured: !!domain,
        domain: domain
      }
    })
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to test Daily.co connection',
        details: config.app.isDevelopment && error instanceof Error ? error.message : undefined
      },
      { status: 500 }
    )
  }
}
