import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  formatIntakeForRisk,
  formatSoapForRisk,
  formatVitalsForRisk,
} from '@/lib/risk-alerts/build-clinical-context'
import { analyzeClinicalRisk } from '@/lib/risk-alerts/openai-analyze'
import { guardEncounterAccess } from '@/lib/encounters/guard'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set(['nurse', 'staff', 'doctor'])

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const roleInfo = await fetchUserRole(supabaseAuth, user.id)
    const role = roleInfo?.role?.toLowerCase()
    if (!role || !ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: { encounterId?: number; appointmentId?: number; refresh?: boolean }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const forceRefresh = body.refresh === true

    const encounterId = Number(body.encounterId)
    const appointmentId = Number(body.appointmentId)
    if (!Number.isFinite(encounterId) || encounterId <= 0) {
      return NextResponse.json({ error: 'encounterId is required' }, { status: 400 })
    }
    if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
      return NextResponse.json({ error: 'appointmentId is required' }, { status: 400 })
    }

    await guardEncounterAccess(user.id, encounterId)

    const admin = createAdminClient()

    const { data: enc, error: encErr } = await admin
      .from('encounters')
      .select(
        'id, appointment_id, patient_id, intake_id, risk_level, risk_rationale, risk_factors, risk_assessed_at'
      )
      .eq('id', encounterId)
      .maybeSingle()

    if (encErr || !enc) {
      return NextResponse.json({ error: 'Encounter not found' }, { status: 404 })
    }
    if (Number(enc.appointment_id) !== appointmentId) {
      return NextResponse.json({ error: 'Appointment does not match encounter' }, { status: 400 })
    }

    const encRecord = enc as {
      risk_level?: string | null
      risk_rationale?: string | null
      risk_factors?: unknown
      risk_assessed_at?: string | null
    }

    // Return cached assessment unless client explicitly refreshes
    if (
      !forceRefresh &&
      encRecord.risk_assessed_at &&
      encRecord.risk_level &&
      ['low', 'medium', 'severe'].includes(String(encRecord.risk_level))
    ) {
      const rawFactors = encRecord.risk_factors
      const factors = Array.isArray(rawFactors)
        ? rawFactors.map((x) => String(x))
        : []
      return NextResponse.json({
        data: {
          level: encRecord.risk_level as 'low' | 'medium' | 'severe',
          rationale: encRecord.risk_rationale || '',
          factors,
        },
        cached: true,
        risk_assessed_at: encRecord.risk_assessed_at ?? null,
      })
    }

    let intake: Record<string, unknown> | null = null
    if (enc.intake_id) {
      const { data } = await admin.from('intake_form').select('*').eq('id', enc.intake_id).maybeSingle()
      if (data) intake = data as Record<string, unknown>
    }
    if (!intake) {
      const { data } = await admin.from('intake_form').select('*').eq('appointment_id', appointmentId).maybeSingle()
      if (data) intake = data as Record<string, unknown>
    }

    let soap: {
      subjective_text?: string | null
      objective_text?: string | null
      assessment_text?: string | null
      plan_text?: string | null
    } | null = null

    const { data: soapEnc } = await admin
      .from('ai_soapnotes')
      .select('subjective_text, objective_text, assessment_text, plan_text')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (soapEnc) {
      soap = soapEnc
    } else {
      const { data: soapAppt } = await admin
        .from('ai_soapnotes')
        .select('subjective_text, objective_text, assessment_text, plan_text')
        .eq('appointment_id', appointmentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (soapAppt) soap = soapAppt
    }

    const { data: vitalsRow } = await admin
      .from('vitals')
      .select('*')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const intakeText = formatIntakeForRisk(intake)
    const soapText = formatSoapForRisk(soap)
    const vitalsText = formatVitalsForRisk((vitalsRow as Record<string, unknown>) || null)

    if (!intakeText.trim() && !soapText.trim() && !vitalsText.trim()) {
      return NextResponse.json(
        { error: 'No intake, SOAP, or vitals data available for this encounter yet.' },
        { status: 400 }
      )
    }

    const clinicalBlock = [
      intakeText && `INTAKE / HISTORY:\n${intakeText}`,
      vitalsText && vitalsText,
      soapText && `AI SOAP NOTE:\n${soapText}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    const result = await analyzeClinicalRisk(clinicalBlock)

    const assessedAt = new Date().toISOString()
    const { error: saveErr } = await admin
      .from('encounters')
      .update({
        risk_level: result.level,
        risk_rationale: result.rationale,
        risk_factors: result.factors,
        risk_assessed_at: assessedAt,
      })
      .eq('id', encounterId)

    if (saveErr) {
      console.error('[risk-alerts] persist failed', saveErr)
      // Still return result so UI works; warn in response
      return NextResponse.json({
        data: result,
        cached: false,
        persistWarning: saveErr.message,
        risk_assessed_at: assessedAt,
      })
    }

    return NextResponse.json({ data: result, cached: false, risk_assessed_at: assessedAt })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Risk analysis failed'
    if (message.includes('OPENAI_API_KEY')) {
      return NextResponse.json({ error: 'Risk alerts are not configured (missing OPENAI_API_KEY).' }, { status: 503 })
    }
    console.error('[risk-alerts]', e)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
