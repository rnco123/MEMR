import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  buildIcdUserPayload,
  formatIntakeSubjectiveForIcd,
  formatSoapSubjectiveOnly,
} from '@/lib/icd-suggestions/format-subjective-for-icd'
import { suggestIcdCodesFromSubjective } from '@/lib/icd-suggestions/suggest-icd-openai'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set(['nurse', 'staff', 'doctor'])

async function requireStaffAndRun(encounterId: number): Promise<NextResponse> {
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

    if (!Number.isFinite(encounterId) || encounterId <= 0) {
      return NextResponse.json({ error: 'Invalid encounter id' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: enc, error: encErr } = await admin
      .from('encounters')
      .select('id, appointment_id, intake_id')
      .eq('id', encounterId)
      .maybeSingle()

    if (encErr || !enc) {
      return NextResponse.json({ error: 'Encounter not found' }, { status: 404 })
    }

    const appointmentId = Number(enc.appointment_id)

    let intake: Record<string, unknown> | null = null
    if (enc.intake_id) {
      const { data } = await admin.from('intake_form').select('*').eq('id', enc.intake_id).maybeSingle()
      if (data) intake = data as Record<string, unknown>
    }
    if (!intake && Number.isFinite(appointmentId) && appointmentId > 0) {
      const { data } = await admin
        .from('intake_form')
        .select('*')
        .eq('appointment_id', appointmentId)
        .maybeSingle()
      if (data) intake = data as Record<string, unknown>
    }

    const { data: soapRow } = await admin
      .from('ai_soapnotes')
      .select('subjective_text')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let soapSubjective = formatSoapSubjectiveOnly(soapRow as { subjective_text?: string | null } | null)

    if (!soapSubjective && Number.isFinite(appointmentId) && appointmentId > 0) {
      const { data: soapAppt } = await admin
        .from('ai_soapnotes')
        .select('subjective_text')
        .eq('appointment_id', appointmentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      soapSubjective = formatSoapSubjectiveOnly(soapAppt as { subjective_text?: string | null } | null)
    }

    const intakeBlock = formatIntakeSubjectiveForIcd(intake)
    const payload = buildIcdUserPayload(intakeBlock, soapSubjective)

    if (!payload.trim()) {
      return NextResponse.json({
        ok: false,
        message: "AI can't find ICD code",
        detail: 'No intake or AI SOAP subjective text for this encounter.',
      })
    }

    const result = await suggestIcdCodesFromSubjective(payload)

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message })
    }

    return NextResponse.json({ ok: true, icd_suggestions: result.icd_suggestions })
  } catch (e) {
    console.error('[icd-suggestions]', e)
    return NextResponse.json({ ok: false, message: "AI can't find ICD code" }, { status: 500 })
  }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return requireStaffAndRun(Number(params.id))
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return requireStaffAndRun(Number(params.id))
}
