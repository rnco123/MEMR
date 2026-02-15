import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'

/**
 * Test login endpoint with hardcoded credentials
 * SECURITY WARNING: This endpoint should be REMOVED or DISABLED in production
 * It contains hardcoded test credentials which is a security risk
 */
export async function POST(request: NextRequest) {
  // Disable in production - this endpoint should not exist in production
  if (config.app.isProduction) {
    return NextResponse.json(
      { error: 'Test endpoints are disabled in production' },
      { status: 403 }
    )
  }

  // Also check for explicit disable flag
  if (process.env.DISABLE_TEST_LOGIN === 'true') {
    return NextResponse.json(
      { error: 'Test login endpoint is disabled' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // SECURITY WARNING: Hardcoded test credentials
    // These should NEVER be used in production
    const TEST_USERS = {
      'doctor@myclinicmd.com': {
        password: 'doctor123',
        role: 'doctor',
        id: 'test-doctor-001',
        full_name: 'Dr. Test Doctor',
      },
      'nurse@myclinicmd.com': {
        password: 'nurse123',
        role: 'nurse',
        id: 'test-nurse-001',
        full_name: 'Test Nurse',
      },
    }

    const user = TEST_USERS[email as keyof typeof TEST_USERS]

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    if (user.password !== password) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Return user data with role
    return NextResponse.json({
      user: {
        id: user.id,
        email: email,
        user_metadata: {
          full_name: user.full_name,
          role: user.role,
        },
      },
      role: user.role,
      success: true,
      warning: 'This is a test endpoint. Do not use in production.'
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
