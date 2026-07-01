import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { roomingPatchSchema } from '@/lib/validation'
import { handleApiError, AuthenticationError, ValidationError } from '@/lib/api-error-handler'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncImmigrationCase } from '@/lib/immigration/case-sync'
import { isImmigrationEncounter } from '@/lib/i693/types'
import { IMMIGRATION_PROGRAM } from '@/lib/immigration/types'
import { guardEncounterAccess, ENCOUNTER_WRITE_ACCESS } from '@/lib/encounters/guard'
export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId)) throw new ValidationError('Invalid encounter id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = roomingPatchSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data

    await guardEncounterAccess(user.id, encounterId, ENCOUNTER_WRITE_ACCESS)

    const { data: existing, error: fetchError } = await supabase
      .from('encounters')
      .select('id, consent_ack, program_type')
      .eq('id', encounterId)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!existing) throw new ValidationError('Encounter not found')

    const prevConsent =
      existing.consent_ack && typeof existing.consent_ack === 'object' && !Array.isArray(existing.consent_ack)
        ? (existing.consent_ack as Record<string, string>)
        : {}

    // Client sends the full desired consent_ack map; replace (do not merge) so unchecked keys are removed.
    const nextConsent = v.consent_ack

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    const stamp = (checked: boolean) => (checked ? new Date().toISOString() : null)
    if (v.identity_verified !== undefined) patch.identity_verified_at = stamp(v.identity_verified)
    if (v.prescribing_location_ack !== undefined) {
      patch.prescribing_location_ack_at = stamp(v.prescribing_location_ack)
    }
    if (v.ma_supervision_ack !== undefined) patch.ma_supervision_ack_at = stamp(v.ma_supervision_ack)
    if (v.ready_for_doctor !== undefined) patch.ready_for_doctor_at = stamp(v.ready_for_doctor)
    if (v.ma_exam_findings !== undefined) {
      patch.ma_exam_findings = v.ma_exam_findings
    }
    if (nextConsent !== undefined) {
      patch.consent_ack = nextConsent
      if (isImmigrationEncounter(nextConsent)) {
        patch.program_type = IMMIGRATION_PROGRAM
      } else if (
        isImmigrationEncounter(prevConsent) &&
        existing.program_type === IMMIGRATION_PROGRAM
      ) {
        patch.program_type = null
      }
    }
    if (v.pharmacy_id !== undefined) {
      patch.pharmacy_id = v.pharmacy_id
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('encounters')
      .update(patch)
      .eq('id', encounterId)
      .select()
      .single()

    if (error) throw error

    if (isImmigrationEncounter(data.consent_ack)) {
      await syncImmigrationCase(admin, encounterId)
    }

    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}
