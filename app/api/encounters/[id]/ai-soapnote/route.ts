import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'

import { guardEncounterAccess } from '@/lib/encounters/guard'
import { CLINICAL_STAFF_ROLE_SET } from '@/lib/roles'
import { handleApiError } from '@/lib/api-error-handler'
export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = CLINICAL_STAFF_ROLE_SET

export type AiSoapNoteRow = {
  id: number
  subjective_text: string | null
  objective_text: string | null
  assessment_text: string | null
  plan_text: string | null
  created_at: string | null
  updated_at: string | null
  encounter_id: number | null
  priority: string | null
}

/** Latest AI SOAP row for this encounter (created_at desc). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
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

    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId) || encounterId <= 0) {
      return NextResponse.json({ error: 'Invalid encounter id' }, { status: 400 })
    }

    await guardEncounterAccess(user.id, encounterId)


    const admin = createAdminClient()
    const { data: enc, error: encErr } = await admin.from('encounters').select('id').eq('id', encounterId).maybeSingle()
    if (encErr || !enc) {
      return NextResponse.json({ error: 'Encounter not found' }, { status: 404 })
    }

    const { data: rows, error: soapErr } = await admin
      .from('ai_soapnotes')
      .select(
        'id, subjective_text, objective_text, assessment_text, plan_text, created_at, updated_at, encounter_id, priority'
      )
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (soapErr) {
      console.error('[ai-soapnote]', soapErr)
      return NextResponse.json({ error: 'Failed to load SOAP note', detail: soapErr.message }, { status: 500 })
    }

    const row = rows?.[0] as AiSoapNoteRow | undefined
    return NextResponse.json({
      encounterId,
      soap: row ?? null,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
