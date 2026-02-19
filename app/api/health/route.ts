/**
 * Health check endpoint for monitoring
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering since we use cookies for database connection check
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const healthData: {
      status: string
      timestamp: string
      database: string
      version?: string
    } = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'unknown',
    }

    // Check database connection
    try {
      const supabase = await createClient()
      const { error } = await supabase.from('profiles').select('uid').limit(1)

      if (error) {
        healthData.database = 'unhealthy'
        healthData.status = 'degraded'
      } else {
        healthData.database = 'healthy'
      }
    } catch (error) {
      healthData.database = 'unhealthy'
      healthData.status = 'unhealthy'
    }

    // Add version info (optional)
    healthData.version = process.env.npm_package_version || '1.0.0'

    const statusCode = healthData.status === 'healthy' ? 200 : healthData.status === 'degraded' ? 200 : 503

    return NextResponse.json(healthData, { status: statusCode })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      },
      { status: 503 }
    )
  }
}
