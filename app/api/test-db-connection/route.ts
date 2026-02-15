import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { config } from '@/lib/config'

/**
 * Test database connection endpoint
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
    const supabase = await createClient()

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch patient count
    const { count, error } = await supabase
      .from('patients')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('Error fetching patient count:', error)
      return NextResponse.json(
        { 
          error: 'Database connection error',
          details: config.app.isDevelopment ? error.message : undefined
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      patient_count: count || 0,
      message: 'Database connection successful'
    })
  } catch (error) {
    console.error('Error in test-db-connection:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: config.app.isDevelopment && error instanceof Error ? error.message : undefined
      },
      { status: 500 }
    )
  }
}
