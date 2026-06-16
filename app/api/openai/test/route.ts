import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Minimal OpenAI connectivity check (server-only key).
 * Requires authentication — never returns error details to unauthenticated callers (H-11).
 */
export async function GET() {
  // Auth gate — reject unauthenticated callers.
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const key = (process.env.OPENAI_API_KEY || config.openai.apiKey || '').trim()
  if (!key) {
    return NextResponse.json(
      { connected: false, error: 'OPENAI_API_KEY is not set in environment.' },
      { status: 200 }
    )
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${key}`,
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      // Do not expose upstream error body (H-11c).
      return NextResponse.json({
        connected: false,
        error: `OpenAI HTTP ${res.status}`,
      })
    }

    const data = (await res.json()) as { data?: unknown[] }
    const count = Array.isArray(data.data) ? data.data.length : 0

    return NextResponse.json({
      connected: true,
      message: 'OpenAI API key is valid.',
      sampleModelsReturned: count,
    })
  } catch (e) {
    return NextResponse.json({
      connected: false,
      error: e instanceof Error ? e.message : 'Network or fetch failed',
    })
  }
}
