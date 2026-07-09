import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { config } from '@/lib/config'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { isPhysicianNurseAdminRole } from '@/lib/roles'
import { assertEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/assert-access'
import { generateSoapNoteForEncounter } from '@/lib/soap/generate-soap'
import { AppError } from '@/lib/api-error-handler'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'

/**
 * Complete the SOAP note for an encounter. Called after vitals are saved.
 * Expects body: { encounter_id: string }. Returns { success, message }.
 *
 * Generation is in-app (lib/soap/generate-soap): deterministic S/O from the
 * chart, OpenAI for A/P. The legacy Railway microservice is used only as a
 * fallback when in-app generation errors AND its URL is explicitly configured
 * — so environments without that service keep working.
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
    if (!isPhysicianNurseAdminRole(role)) {
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
      return NextResponse.json({ error: 'encounter_id is required' }, { status: 400 })
    }

    const encounterIdNum = Number(encounterId)
    if (isNaN(encounterIdNum) || encounterIdNum <= 0) {
      return NextResponse.json({ error: 'Invalid encounter_id' }, { status: 400 })
    }

    // H-05c: Assert encounter-level access before generating.
    const admin = createAdminClient()
    await assertEncounterAccess(admin, user.id, encounterIdNum, ENCOUNTER_WRITE_ACCESS)

    try {
      const note = await generateSoapNoteForEncounter(admin, encounterIdNum)

      auditPhi({
        user,
        role,
        action: 'encounter_updated',
        resourceType: 'encounter',
        resourceId: encounterIdNum,
        metadata: { section: 'ai_soap', engine: 'in_app', mode: note.mode },
        request,
      })

      return NextResponse.json({
        success: true,
        message:
          note.mode === 'full'
            ? 'SOAP data stored successfully'
            : 'SOAP saved from chart data. AI assessment/plan unavailable — complete them manually.',
        mode: note.mode,
      })
    } catch (genErr) {
      // Client-level errors (no data, bad encounter) go straight back to the user.
      if (genErr instanceof AppError && genErr.statusCode < 500) {
        return NextResponse.json(
          { error: 'SOAP note could not be generated', message: genErr.message },
          { status: genErr.statusCode }
        )
      }

      // Legacy fallback: only when the external service is explicitly configured.
      const legacyUrl = config.soapNotes.apiUrl?.trim()
      if (!legacyUrl) throw genErr

      console.error('[SOAP complete-soap] In-app generation failed, trying legacy service:', genErr)
      const res = await fetch(legacyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encounter_id: String(encounterId) }),
      })
      const text = await res.text()
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        // response not JSON
      }
      if (!res.ok) {
        console.error('[SOAP complete-soap] Legacy API error:', res.status, text)
        return NextResponse.json(
          { error: 'SOAP API request failed', message: `Upstream returned HTTP ${res.status}`, status: res.status },
          { status: 502 }
        )
      }
      return NextResponse.json(json ?? { success: true, message: 'SOAP data stored successfully' })
    }
  } catch (err) {
    console.error('[SOAP complete-soap] Error:', err)
    Sentry.captureException(err, { tags: { route: 'soap-complete-soap' } })
    return NextResponse.json({ error: 'Failed to complete SOAP note' }, { status: 500 })
  }
}
