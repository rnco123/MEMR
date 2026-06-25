import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { improveTextSchema } from '@/lib/support/types'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = improveTextSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful writing assistant. Improve the following support ticket message for clarity and grammar. ' +
              'Make it professional and easy to understand. Return ONLY the improved text with no explanation, no preamble, no quotes.',
          },
          {
            role: 'user',
            content: parsed.data.text,
          },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[AI improve] OpenAI error:', errText)
      return NextResponse.json({ error: 'AI service error' }, { status: 502 })
    }

    const data = await response.json()
    const improved = data?.choices?.[0]?.message?.content?.trim() || parsed.data.text

    return NextResponse.json({ improved })
  } catch (err) {
    console.error('[POST /api/support/ai/improve]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
