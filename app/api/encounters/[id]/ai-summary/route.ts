import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

const SUMMARY_SYSTEM_PROMPT = `You are a clinical documentation assistant. Given a telemedicine session transcript, extract and return a JSON object with these fields:

{
  "summary": "2-3 sentence plain-English summary of the consultation",
  "chief_complaint": "patient's main reason for the visit",
  "diagnosis": "primary diagnosis or assessment if mentioned, else null",
  "plan": "treatment plan discussed",
  "follow_up": {
    "needed": true or false,
    "timeframe": "e.g. '2 weeks', '1 month', null if not mentioned",
    "reason": "why the patient should return, or null"
  },
  "tests_ordered": ["list of labs, imaging, or tests ordered, empty array if none"],
  "medications_mentioned": ["any medications prescribed or adjusted, empty array if none"],
  "patient_instructions": "key instructions given to the patient, or null",
  "red_flags": ["any warning signs patient was told to watch for, empty array if none"]
}

Return ONLY valid JSON. Do not include markdown or explanation.`

async function getUserFromRequest(request: Request): Promise<{ id: string } | null> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (token) {
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user) return user
  }

  const supabaseServer = await createServerClient()
  const { data: { session } } = await supabaseServer.auth.getSession()
  return session?.user ?? null
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const encounterId = Number(params.id)
    if (isNaN(encounterId)) {
      return NextResponse.json({ error: 'Invalid encounter ID' }, { status: 400 })
    }

    // Use server client with user context
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const supabase = token
      ? createClient(config.supabase.url, config.supabase.anonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        })
      : await createServerClient()

    // Verify caller is a doctor or nurse on this encounter
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('uid', user.id)
      .maybeSingle()

    const role = profile?.role as string | null
    if (!role || !['doctor', 'nurse', 'staff'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Fetch transcript lines for this encounter
    const { data: lines, error: txError } = await supabase
      .from('telemedicine_transcripts')
      .select('speaker_role, speaker_name, message, created_at')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: true })

    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 500 })
    }

    // Also accept inline transcript from request body (for lines not yet saved to DB)
    let body: { inlineTranscript?: Array<{ speaker_role: string; speaker_name: string; message: string }> } = {}
    try {
      body = await request.json().catch(() => ({}))
    } catch { body = {} }

    const inlineLines = body.inlineTranscript ?? []

    const allLines = [
      ...(lines ?? []),
      ...inlineLines.map((l) => ({ ...l, created_at: null })),
    ]

    if (allLines.length === 0) {
      return NextResponse.json(
        { error: 'No transcript available for this encounter' },
        { status: 404 }
      )
    }

    // Format as a readable dialogue
    const dialogue = allLines
      .map((l) => `[${l.speaker_role.toUpperCase()}] ${l.speaker_name}: ${l.message}`)
      .join('\n')

    // Call OpenAI
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: `Session transcript:\n\n${dialogue}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      return NextResponse.json(
        { error: 'OpenAI request failed', details: errText },
        { status: 502 }
      )
    }

    const aiData = await aiResponse.json()
    const rawContent = aiData.choices?.[0]?.message?.content ?? '{}'

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawContent)
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse AI response', raw: rawContent },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      encounter_id: encounterId,
      transcript_lines: allLines.length,
      summary: parsed,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
