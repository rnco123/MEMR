/**
 * Health check endpoint for monitoring
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering since we use cookies for database connection check
export const dynamic = 'force-dynamic'

const isProduction = process.env.NODE_ENV === 'production'

export async function GET() {
  try {
    let dbOk = false

    // L-02: Only probe DB in non-production or when it's a monitored path.
    try {
      const supabase = await createClient()
      const { error } = await supabase.from('profiles').select('uid').limit(1)
      dbOk = !error
    } catch {
      dbOk = false
    }

    const status = dbOk ? 'healthy' : 'degraded'
    const statusCode = dbOk ? 200 : 503

    // L-02a: In production omit sensitive details (DB probe status, version).
    if (isProduction) {
      return NextResponse.json({ ok: dbOk, status }, { status: statusCode })
    }

    return NextResponse.json(
      {
        ok: dbOk,
        status,
        timestamp: new Date().toISOString(),
        database: dbOk ? 'healthy' : 'unhealthy',
        version: process.env.npm_package_version || '1.0.0',
      },
      { status: statusCode }
    )
  } catch {
    return NextResponse.json({ ok: false, status: 'unhealthy' }, { status: 503 })
  }
}
