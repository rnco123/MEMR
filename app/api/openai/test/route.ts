import { NextResponse } from 'next/server'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

/**
 * Minimal OpenAI connectivity check (server-only key).
 * GET https://api.openai.com/v1/models — validates auth without running chat.
 */
export async function GET() {
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
      const text = await res.text().catch(() => '')
      return NextResponse.json({
        connected: false,
        error: `OpenAI HTTP ${res.status}`,
        detail: text.slice(0, 300),
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
