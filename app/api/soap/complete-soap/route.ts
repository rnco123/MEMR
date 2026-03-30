import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

/** Railway exposes this path; `/api/soap/complete-soap` is not registered (404). */
const DEFAULT_SOAP_API =
  'https://mcm-soapnotes-production.up.railway.app/api/soap/complete-soapnotes'

function getSoapCompleteUrl(): string {
  const fromEnv = config.soapNotes.apiUrl?.trim()
  return fromEnv || DEFAULT_SOAP_API
}

/**
 * Proxy to the external Complete SOAP Notes API.
 * Called after vitals are saved to trigger AI SOAP note generation.
 * Expects body: { encounter_id: string }. Returns { success, message } from external API.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { encounter_id?: string | number } = {}
    try {
      body = await request.json().catch(() => ({}))
    } catch {
      // ignore
    }

    const encounterId = body.encounter_id
    if (encounterId == null || encounterId === '') {
      return NextResponse.json(
        { error: 'encounter_id is required' },
        { status: 400 }
      )
    }

    const encounterIdStr = String(encounterId)

    const res = await fetch(getSoapCompleteUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        encounter_id: encounterIdStr,
      }),
    })

    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      // response not JSON
    }

    if (!res.ok) {
      console.error('[SOAP complete-soap] External API error:', res.status, text)
      const d = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
      const upstreamMessage =
        (typeof d?.message === 'string' && d.message) ||
        (typeof d?.error === 'string' && d.error) ||
        (text && text.length < 500 ? text : null) ||
        `Upstream returned HTTP ${res.status}`
      return NextResponse.json(
        {
          error: 'SOAP API request failed',
          /** Human-readable reason from Railway (e.g. "No vitals found for encounter_id: 19") */
          message: upstreamMessage,
          status: res.status,
          details: json ?? text,
        },
        { status: 502 }
      )
    }

    // Forward success response: { success: true, message: "SOAP data stored successfully" }
    return NextResponse.json(json ?? { success: true, message: 'SOAP data stored successfully' })
  } catch (err) {
    console.error('[SOAP complete-soap] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to call SOAP API' },
      { status: 500 }
    )
  }
}
