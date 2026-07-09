import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { handleApiError, AuthenticationError, AuthorizationError, ValidationError } from '@/lib/api-error-handler'
import { mergeI693Form } from '@/lib/i693/types'
import { prefillFromPatient } from '@/lib/i693/ai-fill'
import type { I693FormData } from '@/lib/i693/types'
import { buildI693ClinicalContext } from '@/lib/i693/build-context'
import { fillI693WithOpenAI } from '@/lib/i693/ai-fill'
import { syncImmigrationCase } from '@/lib/immigration/case-sync'
import { isImmigrationEncounter } from '@/lib/i693/types'
import { isI693ApiRole } from '@/lib/immigration/api-auth'
import { logI693Audit } from '@/lib/i693/audit-log'
import { resolvePatientI693ForEncounter } from '@/lib/i693/patient-form'

import { guardI693EncounterAccess } from '@/lib/encounters/guard'
import { resolveEncounterPatientId } from '@/lib/encounters/resolve-patient-id'
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId)) throw new ValidationError('Invalid encounter id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isI693ApiRole(roleInfo?.role)) throw new AuthorizationError()
    const role = roleInfo!.role!.trim().toLowerCase()

    await guardI693EncounterAccess(user.id, encounterId)


    const admin = createAdminClient()
    const { data: enc, error: encErr } = await admin
      .from('encounters')
      .select('id, patient_id, appointment_id')
      .eq('id', encounterId)
      .maybeSingle()

    if (encErr) throw encErr
    if (!enc) throw new ValidationError('Encounter not found')

    const patientId = await resolveEncounterPatientId(admin, enc)
    if (patientId == null) {
      throw new ValidationError('Patient is not linked to this encounter')
    }

    const bundle = await buildI693ClinicalContext(admin, encounterId, patientId)
    if (!bundle.textBlock.trim()) {
      throw new ValidationError(
        'No patient or clinical data found. Add patient demographics, intake, vitals, or SOAP notes before AI fill.'
      )
    }

    const { submission: existing } = await resolvePatientI693ForEncounter(admin, patientId)

    let base = mergeI693Form((existing?.form_data as Partial<I693FormData>) ?? undefined)
    base = prefillFromPatient(bundle.patient, bundle.vitals, base)

    const { form, model } = await fillI693WithOpenAI(bundle.textBlock, base)
    const now = new Date().toISOString()

    const row = {
      form_data: form,
      status: 'ai_filled',
      ai_filled_at: now,
      ai_model: model,
      updated_at: now,
    }

    if (existing?.id) {
      const { data, error } = await admin
        .from('i693_submissions')
        .update(row)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      const form_data = mergeI693Form(data.form_data as Partial<I693FormData>)
      const { data: encRow } = await admin.from('encounters').select('consent_ack').eq('id', encounterId).maybeSingle()
      if (isImmigrationEncounter(encRow?.consent_ack)) {
        await syncImmigrationCase(admin, encounterId)
      }
      await logI693Audit('ai_filled', encounterId, {
        patient_id: enc.patient_id,
        status: 'ai_filled',
        role,
        ai_model: model,
        source: role === 'admin' ? 'admin' : 'clinical',
      })
      return NextResponse.json({
        success: true,
        data: { ...data, form_data },
        form_data,
        model,
      })
    }

    const { data, error } = await admin
      .from('i693_submissions')
      .insert({
        ...row,
        encounter_id: encounterId,
        patient_id: patientId,
      })
      .select()
      .single()
    if (error) throw error
    const form_data = mergeI693Form(data.form_data as Partial<I693FormData>)
    const { data: encRow } = await admin.from('encounters').select('consent_ack').eq('id', encounterId).maybeSingle()
    if (isImmigrationEncounter(encRow?.consent_ack)) {
      await syncImmigrationCase(admin, encounterId)
    }
    await logI693Audit('ai_filled', encounterId, {
      patient_id: enc.patient_id,
      status: 'ai_filled',
      role,
      ai_model: model,
      source: role === 'admin' ? 'admin' : 'clinical',
    })
    return NextResponse.json({
      success: true,
      data: { ...data, form_data },
      form_data,
      model,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
