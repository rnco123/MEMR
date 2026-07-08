import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { handleApiError, AuthenticationError, AuthorizationError, ValidationError } from '@/lib/api-error-handler'
import { mergeI693Form } from '@/lib/i693/types'
import {
  isImmigrationEncounterForI693,
  loadEncounterImmigrationContext,
} from '@/lib/i693/immigration-eligibility'
import { prefillFromPatient, normalizeI693FormAddress } from '@/lib/i693/ai-fill'
import type { I693FormData } from '@/lib/i693/types'
import { buildI693ClinicalContext } from '@/lib/i693/build-context'
import { syncImmigrationCase } from '@/lib/immigration/case-sync'
import { isI693ApiRole } from '@/lib/immigration/api-auth'
import { logI693Audit } from '@/lib/i693/audit-log'
import { syncI693PdfToPatientFileAfterSave } from '@/lib/i693/save-patient-document'
import { resolveEncounterPatientId } from '@/lib/encounters/resolve-patient-id'

import { guardI693EncounterAccess } from '@/lib/encounters/guard'
export const dynamic = 'force-dynamic'

async function requireStaff(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const roleInfo = await fetchUserRole(supabase, userId)
  const role = roleInfo?.role
  if (!isI693ApiRole(role)) throw new AuthorizationError()
  return role!.trim().toLowerCase()
}

function queueI693PatientFileSync(
  admin: ReturnType<typeof createAdminClient>,
  encounterId: number,
  patientId: number,
  formData: ReturnType<typeof mergeI693Form>,
  userId: string
) {
  void syncI693PdfToPatientFileAfterSave(admin, encounterId, patientId, formData, userId).catch(
    (err) => console.error('[i693] patient file sync on save:', err)
  )
}

async function maybeSyncImmigrationCase(
  admin: ReturnType<typeof createAdminClient>,
  encounterId: number
) {
  const ctx = await loadEncounterImmigrationContext(admin, encounterId)
  if (ctx?.isImmigration) {
    await syncImmigrationCase(admin, encounterId)
  }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId)) throw new ValidationError('Invalid encounter id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()
    const role = await requireStaff(supabase, user.id)

    await guardI693EncounterAccess(user.id, encounterId)

    const admin = createAdminClient()
    const { data: enc, error: encErr } = await admin
      .from('encounters')
      .select(
        `
        id,
        patient_id,
        consent_ack,
        program_type,
        appointments:appointment_id (
          services:service_id ( title_en, title_es )
        )
      `
      )
      .eq('id', encounterId)
      .maybeSingle()

    if (encErr) throw encErr
    if (!enc) throw new ValidationError('Encounter not found')

    const { data: existing } = await admin
      .from('i693_submissions')
      .select('*')
      .eq('encounter_id', encounterId)
      .maybeSingle()

    let formData = mergeI693Form((existing?.form_data as Partial<I693FormData>) ?? undefined)

    // Auto-prefill from the patient record only before the form has ever been
    // saved. Re-running it on every load would re-fill any field the user
    // intentionally cleared or changed, so once a submission exists the saved
    // form_data is authoritative. (Explicit AI Fill / Location autofill still
    // work — those are separate actions.)
    const patientId = await resolveEncounterPatientId(admin, enc)
    if (!existing && patientId != null) {
      const bundle = await buildI693ClinicalContext(admin, encounterId, patientId)
      formData = prefillFromPatient(bundle.patient, bundle.vitals, formData)
    }

    // Normalise address fields (state abbreviation, split full address from street)
    formData = normalizeI693FormAddress(formData)

    await logI693Audit('viewed', encounterId, {
      patient_id: enc.patient_id,
      role,
      source: role === 'admin' ? 'admin' : 'clinical',
    })

    return NextResponse.json({
      encounter_id: encounterId,
      patient_id: enc.patient_id,
      is_immigration: isImmigrationEncounterForI693(enc),
      submission: existing ?? null,
      form_data: formData,
    })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const encounterId = Number(params.id)
    if (!Number.isFinite(encounterId)) throw new ValidationError('Invalid encounter id')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()
    const role = await requireStaff(supabase, user.id)

    await guardI693EncounterAccess(user.id, encounterId)

    let body: { form_data?: Partial<I693FormData>; status?: string }
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const formData = normalizeI693FormAddress(mergeI693Form(body.form_data ?? {}))
    const status = body.status ?? 'draft'

    const admin = createAdminClient()
    const { data: enc } = await admin
      .from('encounters')
      .select('id, patient_id')
      .eq('id', encounterId)
      .maybeSingle()
    if (!enc) throw new ValidationError('Encounter not found')

    const { data: existing } = await admin
      .from('i693_submissions')
      .select('id')
      .eq('encounter_id', encounterId)
      .maybeSingle()

    const row = {
      encounter_id: encounterId,
      patient_id: enc.patient_id,
      form_data: formData,
      status,
      updated_at: new Date().toISOString(),
    }

    if (existing?.id) {
      const { data, error } = await admin
        .from('i693_submissions')
        .update(row)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      await maybeSyncImmigrationCase(admin, encounterId)
      await logI693Audit('saved', encounterId, {
        patient_id: enc.patient_id,
        status,
        role,
        source: role === 'admin' ? 'admin' : 'clinical',
      })
      queueI693PatientFileSync(admin, encounterId, Number(enc.patient_id), formData, user.id)
      return NextResponse.json({
        success: true,
        data: { ...data, form_data: mergeI693Form(data.form_data as Partial<I693FormData>) },
      })
    }

    const { data, error } = await admin.from('i693_submissions').insert(row).select().single()
    if (error) throw error
    await maybeSyncImmigrationCase(admin, encounterId)
    await logI693Audit('saved', encounterId, {
      patient_id: enc.patient_id,
      status,
      role,
      source: role === 'admin' ? 'admin' : 'clinical',
    })
    queueI693PatientFileSync(admin, encounterId, Number(enc.patient_id), formData, user.id)
    return NextResponse.json({
      success: true,
      data,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
