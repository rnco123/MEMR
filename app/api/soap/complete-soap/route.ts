import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { config } from '@/lib/config'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { assertEncounterAccess } from '@/lib/encounters/assert-access'

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
    // H-05a: Use getUser() instead of the session cookie shortcut for verified auth.
    const supabase = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // H-05b: Require clinical staff role (doctor or nurse minimum).
    const roleInfo = await fetchUserRole(supabase, user.id)
    const role = roleInfo?.role
    if (!role || !['doctor', 'nurse', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden: clinical role required' }, { status: 403 })
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

    const encounterIdNum = Number(encounterId)
    if (isNaN(encounterIdNum) || encounterIdNum <= 0) {
      return NextResponse.json({ error: 'Invalid encounter_id' }, { status: 400 })
    }

    // H-05c: Assert encounter-level access before proxying to external API.
    const admin = createAdminClient()
    await assertEncounterAccess(admin, user.id, encounterIdNum)

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
          message: upstreamMessage,
          status: res.status,
          details: json ?? text,
        },
        { status: 502 }
      )
    }

    return NextResponse.json(json ?? { success: true, message: 'SOAP data stored successfully' })
  } catch (err) {
    console.error('[SOAP complete-soap] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to call SOAP API' },
      { status: 500 }
    )
  }
}
