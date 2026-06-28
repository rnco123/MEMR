import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  buildIcdUserPayload,
  formatIntakeSubjectiveForIcd,
  formatSoapSubjectiveOnly,
} from '@/lib/icd-suggestions/format-subjective-for-icd'
import { suggestIcdCodesFromSubjective } from '@/lib/icd-suggestions/suggest-icd-openai'
import { guardEncounterAccess } from '@/lib/encounters/guard'
import { canViewClinicalEncounterContent } from '@/lib/roles'
import { loadAiSoapSubjectiveForEncounter } from '@/lib/encounters/load-ai-soap-for-encounter'
import { loadIntakeForEncounter } from '@/lib/encounters/load-intake-for-encounter'

export const dynamic = 'force-dynamic'

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
    if (!canViewClinicalEncounterContent(roleInfo?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!Number.isFinite(encounterId) || encounterId <= 0) {
      return NextResponse.json({ error: 'Invalid encounter id' }, { status: 400 })
    }

    await guardEncounterAccess(user.id, encounterId)

    const admin = createAdminClient()

    const { data: enc, error: encErr } = await admin
      .from('encounters')
      .select('id, appointment_id, intake_id')
      .eq('id', encounterId)
      .maybeSingle()

    if (encErr || !enc) {
      return NextResponse.json({ error: 'Encounter not found' }, { status: 404 })
    }

    const appointmentId =
      enc.appointment_id != null && Number.isFinite(Number(enc.appointment_id))
        ? Number(enc.appointment_id)
        : null
    const intakeId =
      enc.intake_id != null && Number.isFinite(Number(enc.intake_id)) ? Number(enc.intake_id) : null

    const intake = await loadIntakeForEncounter(admin, intakeId, appointmentId)
    const soapRow = await loadAiSoapSubjectiveForEncounter(admin, encounterId, appointmentId)
    const soapSubjective = formatSoapSubjectiveOnly(soapRow)

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
    Sentry.captureException(e, { tags: { route: 'icd-suggestions' } })
    return NextResponse.json({ ok: false, message: "AI can't find ICD code" }, { status: 500 })
  }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return requireStaffAndRun(Number(params.id))
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return requireStaffAndRun(Number(params.id))
}
