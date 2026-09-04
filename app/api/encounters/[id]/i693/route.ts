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
import { resolvePatientI693ForEncounter } from '@/lib/i693/patient-form'
import { guardI693EncounterAccess } from '@/lib/encounters/guard'

export const dynamic = 'force-dynamic'

async function requireStaff(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const roleInfo = await fetchUserRole(supabase, userId)
  const role = roleInfo?.role
  if (!isI693ApiRole(role)) throw new AuthorizationError()
  return role!.trim().toLowerCase()
}

async function syncI693PatientFile(
  admin: ReturnType<typeof createAdminClient>,
  encounterId: number,
  patientId: number,
  formData: ReturnType<typeof mergeI693Form>,
  userId: string
): Promise<void> {
  await syncI693PdfToPatientFileAfterSave(admin, encounterId, patientId, formData, userId)
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
        created_at,
        consent_ack,
        program_type,
        appointments:appointment_id (
          appointment_date,
          appointment_time,
          services:service_id ( title_en, title_es )
        )
      `
      )
      .eq('id', encounterId)
      .maybeSingle()

    if (encErr) throw encErr
    if (!enc) throw new ValidationError('Encounter not found')

    const patientId = await resolveEncounterPatientId(admin, enc)
    if (patientId == null) {
      throw new ValidationError('Patient is not linked to this encounter')
    }

    const { submission: existing, formOwnerEncounterId } = await resolvePatientI693ForEncounter(
      admin,
      patientId
    )

    let formData = mergeI693Form((existing?.form_data as Partial<I693FormData>) ?? undefined)

    // Auto-prefill only before the patient has ever saved a form (one form per patient).
    if (!existing) {
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

    const apptRow = Array.isArray(enc.appointments) ? enc.appointments[0] : enc.appointments
    const appointmentDate =
      (apptRow as { appointment_date?: string | null })?.appointment_date ??
      (enc as { created_at?: string | null }).created_at ??
      null

    return NextResponse.json({
      encounter_id: encounterId,
      patient_id: enc.patient_id,
      appointment_date: appointmentDate,
      form_owner_encounter_id: formOwnerEncounterId,
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

    const patientId = Number(enc.patient_id)
    if (!Number.isFinite(patientId)) {
      throw new ValidationError('Patient is not linked to this encounter')
    }

    const now = new Date().toISOString()
    const submissionPayload = {
      patient_id: patientId,
      form_data: formData as unknown as Record<string, unknown>,
      status,
      updated_at: now,
    }

    const { data: existingSub } = await admin
      .from('i693_submissions')
      .select('id')
      .eq('patient_id', patientId)
      .maybeSingle()

    let submissionId: number
    if (existingSub?.id) {
      const { error: updateErr } = await admin
        .from('i693_submissions')
        .update(submissionPayload)
        .eq('id', existingSub.id)
      if (updateErr) throw updateErr
      submissionId = existingSub.id
    } else {
      const { data: inserted, error: insertErr } = await admin
        .from('i693_submissions')
        .insert({
          ...submissionPayload,
          encounter_id: encounterId,
          created_at: now,
        })
        .select('id')
        .single()
      if (insertErr) throw insertErr
      submissionId = inserted.id
    }

    await syncI693PatientFile(admin, encounterId, patientId, formData, user.id)
    await maybeSyncImmigrationCase(admin, encounterId)

    await logI693Audit('saved', encounterId, {
      patient_id: patientId,
      status,
      role,
      source: role === 'admin' ? 'admin' : 'clinical',
    })

    return NextResponse.json({
      success: true,
      data: {
        id: submissionId,
        encounter_id: encounterId,
        patient_id: patientId,
        form_data: formData,
        status,
      },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
