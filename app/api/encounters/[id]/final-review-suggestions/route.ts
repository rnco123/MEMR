import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createExternalAdminClient } from '@/lib/supabase/external-admin'
import { getUserFromRequest, getSupabaseForRequest } from '@/lib/encounters/auth-from-request'
import { fetchExternalProducts } from '@/lib/mcm/external-catalog'
import {
  buildFinalReviewSystemPrompt,
  buildFinalReviewUserContent,
  formatTranscriptDialogue,
  validateFinalReviewSuggestions,
  type FinalReviewSuggestions,
} from '@/lib/final-review/from-transcript'

export const dynamic = 'force-dynamic'

const CLINICAL_ROLES = ['doctor', 'nurse', 'staff'] as const

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
    if (!Number.isFinite(encounterId)) {
      return NextResponse.json({ error: 'Invalid encounter ID' }, { status: 400 })
    }

    const force = request.nextUrl.searchParams.get('force') === 'true'

    const tokenClient = getSupabaseForRequest(request)
    const supabase = tokenClient ?? (await createServerClient())

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('uid', user.id)
      .maybeSingle()

    const role = profile?.role as string | null
    if (!role || !CLINICAL_ROLES.includes(role as (typeof CLINICAL_ROLES)[number])) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { data: encounter, error: encError } = await supabase
      .from('encounters')
      .select('id, created_at, transcript_summary_json, final_review_suggestions_json, final_review_suggestions_at')
      .eq('id', encounterId)
      .maybeSingle()

    if (encError) {
      return NextResponse.json({ error: encError.message }, { status: 500 })
    }
    if (!encounter) {
      return NextResponse.json({ error: 'Encounter not found' }, { status: 404 })
    }

    if (!force && encounter.final_review_suggestions_json) {
      return NextResponse.json({
        success: true,
        encounter_id: encounterId,
        cached: true,
        generated_at: encounter.final_review_suggestions_at,
        suggestions: encounter.final_review_suggestions_json as FinalReviewSuggestions,
      })
    }

    const { data: lines, error: txError } = await supabase
      .from('telemedicine_transcripts')
      .select('speaker_role, speaker_name, message, created_at')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: true })

    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 500 })
    }

    if (!lines?.length) {
      return NextResponse.json(
        { error: 'No transcript available for this encounter' },
        { status: 404 }
      )
    }

    let external
    try {
      external = createExternalAdminClient()
    } catch {
      return NextResponse.json(
        {
          error:
            'MCM catalog is not configured. Set EXTERNAL_SUPABASE_URL and EXTERNAL_SUPABASE_SECRET_KEY.',
        },
        { status: 503 }
      )
    }

    const catalogProducts = await fetchExternalProducts(external, null)
    const visitDate = encounter.created_at
      ? new Date(encounter.created_at as string).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    const dialogue = formatTranscriptDialogue(lines)
    const summaryHint =
      encounter.transcript_summary_json &&
      typeof encounter.transcript_summary_json === 'object'
        ? (encounter.transcript_summary_json as Record<string, unknown>)
        : null

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: buildFinalReviewSystemPrompt(catalogProducts, visitDate),
          },
          {
            role: 'user',
            content: buildFinalReviewUserContent(dialogue, summaryHint),
          },
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

    const suggestions = validateFinalReviewSuggestions(parsed, catalogProducts)
    const generatedAt = new Date().toISOString()

    const admin = createAdminClient()
    const { error: updateError } = await admin
      .from('encounters')
      .update({
        final_review_suggestions_json: suggestions,
        final_review_suggestions_at: generatedAt,
      })
      .eq('id', encounterId)

    if (updateError) {
      console.error('Failed to cache final review suggestions:', updateError.message)
    }

    return NextResponse.json({
      success: true,
      encounter_id: encounterId,
      cached: false,
      generated_at: generatedAt,
      transcript_lines: lines.length,
      suggestions,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
