import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { config } from '@/lib/config'
import { isPhysicianRole, CLINICAL_STAFF_ROLE_VALUES } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const MAX_LINES = 500
const MODEL = 'gpt-4o-mini'

const SYSTEM_PROMPT = `You are editing a medical conversation transcript.

Rules:
- Return ONLY valid JSON: {"lines":[{"cleaned_transcript":"string"}, ...]}
- The "lines" array MUST have exactly the same length as the input (same order).
- Each cleaned_transcript is grammar, punctuation, and clarity fixes for that line only.
- Do NOT summarize, merge, split, or remove lines.
- Do NOT change speaker_role or speaker_name (they are not in your output).
- Do NOT add medical advice, diagnoses, or new facts.
- Preserve meaning exactly. Keep tone natural.
- For very short or noisy lines, apply minimal cleanup only (punctuation/spacing).`

type TranscriptItem = {
  id: number
  speaker_role: string
  speaker_name: string
  message: string
}

async function getUserFromRequest(
  request: Request
): Promise<{ user: { id: string }; token?: string } | null> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (token) {
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (!error && user) return { user, token }
  }

  // M-04e: Use getUser() for verified server-side auth.
  const supabaseServer = await createServerClient()
  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser()
  if (userErr || !user) return null
  return { user }
}

async function verifyTranscriptAccess(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  encounterId: number
): Promise<{ ok: boolean; status: number; message: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('uid', userId)
    .maybeSingle()

  const role = profile?.role as string | null
  if (!role || !(CLINICAL_STAFF_ROLE_VALUES as readonly string[]).includes(role)) {
    return { ok: false, status: 403, message: 'Not authorized' }
  }

  if (isPhysicianRole(role)) {
    const { data: enc } = await supabase
      .from('encounters')
      .select('id')
      .eq('id', encounterId)
      .maybeSingle()

    if (!enc?.id) {
      return { ok: false, status: 404, message: 'Encounter not found' }
    }

    const { data: doctorRow } = await supabase
      .from('doctors')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (!doctorRow?.id) {
      return { ok: false, status: 403, message: 'Not authorized' }
    }

    const { data: match } = await supabase
      .from('encounters')
      .select('id')
      .eq('id', encounterId)
      .eq('doctor_id', doctorRow.id)
      .maybeSingle()

    if (!match) {
      return { ok: false, status: 403, message: 'Not authorized for this encounter' }
    }
  }

  return { ok: true, status: 200, message: '' }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getUserFromRequest(request)
    const user = authResult?.user ?? null
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = authResult?.token
      ? createClient(config.supabase.url, config.supabase.anonKey, {
          global: { headers: { Authorization: `Bearer ${authResult.token}` } },
        })
      : await createServerClient()

    const rawMode = request.nextUrl.searchParams.get('raw') === 'true'

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { encounterId, items } = body as {
      encounterId?: number
      items?: TranscriptItem[]
    }

    const encounterIdNum = Number(encounterId)
    if (!encounterId || isNaN(encounterIdNum)) {
      return NextResponse.json({ error: 'Invalid encounterId' }, { status: 400 })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 })
    }

    const access = await verifyTranscriptAccess(supabase, user.id, encounterIdNum)
    if (!access.ok) {
      return NextResponse.json({ error: access.message }, { status: access.status })
    }

    const normalized: TranscriptItem[] = []
    for (let i = 0; i < items.length; i++) {
      const t = items[i]
      if (t === undefined) {
        return NextResponse.json({ error: `Missing item at index ${i}` }, { status: 400 })
      }
      const id = Number(t.id)
      if (t.id == null || isNaN(id)) {
        return NextResponse.json(
          { error: `Invalid id at index ${i}` },
          { status: 400 }
        )
      }
      normalized.push({
        id,
        speaker_role: String(t.speaker_role ?? 'patient'),
        speaker_name: String(t.speaker_name ?? 'Unknown').trim() || 'Unknown',
        message: String(t.message ?? ''),
      })
    }

    const ids = normalized.map((t) => t.id)
    const { data: dbRows, error: fetchErr } = await supabase
      .from('telemedicine_transcripts')
      .select('id, encounter_id')
      .in('id', ids)

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    if (!dbRows || dbRows.length !== ids.length) {
      return NextResponse.json(
        { error: 'One or more transcript rows not found' },
        { status: 400 }
      )
    }

    if (dbRows.some((r) => r.encounter_id !== encounterIdNum)) {
      return NextResponse.json(
        { error: 'Transcript rows do not match encounter' },
        { status: 400 }
      )
    }

    let skippedClean = false
    let skipReason: string | undefined

    let cleanedTexts: string[] = normalized.map((t) => t.message)

    if (rawMode) {
      skipReason = 'raw'
      skippedClean = true
    } else if (normalized.length > MAX_LINES) {
      skippedClean = true
      skipReason = `line_limit_${MAX_LINES}`
    } else {
      const openaiKey = process.env.OPENAI_API_KEY
      if (!openaiKey) {
        return NextResponse.json(
          { error: 'OpenAI API key not configured' },
          { status: 500 }
        )
      }

      const payloadForModel = normalized.map((t, index) => ({
        index,
        speaker_role: t.speaker_role,
        speaker_name: t.speaker_name,
        message: t.message,
      }))

      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.15,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Input line count: ${normalized.length}\nInput JSON:\n${JSON.stringify(payloadForModel)}`,
            },
          ],
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

      let parsed: { lines?: Array<{ cleaned_transcript?: string }> }
      try {
        parsed = JSON.parse(rawContent) as { lines?: Array<{ cleaned_transcript?: string }> }
      } catch {
        return NextResponse.json(
          { error: 'Failed to parse AI response', raw: rawContent },
          { status: 500 }
        )
      }

      const outLines = parsed.lines
      if (!Array.isArray(outLines) || outLines.length !== normalized.length) {
        return NextResponse.json(
          { error: 'AI returned invalid line count', expected: normalized.length, got: outLines?.length },
          { status: 500 }
        )
      }

      cleanedTexts = outLines.map((line, i) => {
        const orig = normalized[i]?.message ?? ''
        const c = line?.cleaned_transcript
        if (typeof c !== 'string') return orig
        return c.trim() || orig
      })
    }

    const lines = normalized.map((t, i) => ({
      id: t.id,
      speaker_role: t.speaker_role,
      speaker_name: t.speaker_name,
      message: t.message,
      cleaned_transcript: cleanedTexts[i] ?? t.message,
    }))

    const chunk = 25
    for (let i = 0; i < lines.length; i += chunk) {
      const slice = lines.slice(i, i + chunk)
      const results = await Promise.all(
        slice.map((line) =>
          supabase
            .from('telemedicine_transcripts')
            .update({ cleaned_transcript: line.cleaned_transcript })
            .eq('id', line.id)
            .eq('encounter_id', encounterIdNum)
        )
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) {
        console.error('[clean-transcript] update failed:', failed.error)
        return NextResponse.json({ error: 'Failed to save cleaned transcript' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      encounter_id: encounterIdNum,
      skipped_clean: skippedClean,
      skip_reason: skipReason,
      lines,
    })
  } catch (e) {
    console.error('[clean-transcript]', e)
    Sentry.captureException(e, { tags: { route: 'clean-transcript' } })
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
