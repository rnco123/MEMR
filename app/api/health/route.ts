/**
 * Health check endpoint for monitoring
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const health: {
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
        health.database = 'unhealthy'
        health.status = 'degraded'
      } else {
        health.database = 'healthy'
      }
    } catch (error) {
      health.database = 'unhealthy'
      health.status = 'unhealthy'
    }

    // Add version info (optional)
    health.version = process.env.npm_package_version || '1.0.0'

    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503

    return NextResponse.json(health, { status: statusCode })
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
