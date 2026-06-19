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
import { parseI693Annotations, resolveStoredI693Annotations } from '@/lib/i693/annotations'
import type { I693Annotation } from '@/lib/i693/annotations'
import { syncI693PdfToPatientFileAfterSave } from '@/lib/i693/save-patient-document'

import { guardEncounterAccess } from '@/lib/encounters/guard'
export const dynamic = 'force-dynamic'

function missingAnnotationsColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string }
  return (
    e.code === '42703' ||
    Boolean(e.message?.toLowerCase().includes('annotations'))
  )
}

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
  annotations: I693Annotation[],
  userId: string
) {
  void syncI693PdfToPatientFileAfterSave(admin, encounterId, patientId, formData, annotations, userId).catch(
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

    await guardEncounterAccess(user.id, encounterId)


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
    const storedAnnotations = resolveStoredI693Annotations(existing?.annotations, formData)

    if (!existing) {
      const bundle = await buildI693ClinicalContext(admin, encounterId, Number(enc.patient_id))
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
      annotations: storedAnnotations,
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

    let body: { form_data?: Partial<I693FormData>; status?: string; annotations?: unknown[] }
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const annotations = parseI693Annotations(body.annotations)
    const formData = mergeI693Form({
      ...(body.form_data ?? {}),
      annotation_overlays: annotations.length > 0 ? annotations : undefined,
    })
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

    const rowBase = {
      encounter_id: encounterId,
      patient_id: enc.patient_id,
      form_data: formData,
      status,
      updated_at: new Date().toISOString(),
    }
    const rowWithAnnotations = { ...rowBase, annotations }

    if (existing?.id) {
      const { data, error } = await admin
        .from('i693_submissions')
        .update(rowWithAnnotations)
        .eq('id', existing.id)
        .select()
        .single()
      if (error && missingAnnotationsColumn(error)) {
        const retry = await admin
          .from('i693_submissions')
          .update(rowBase)
          .eq('id', existing.id)
          .select()
          .single()
        if (retry.error) throw retry.error
        const { data } = retry
        await maybeSyncImmigrationCase(admin, encounterId)
        await logI693Audit('saved', encounterId, {
          patient_id: enc.patient_id,
          status,
          role,
          source: role === 'admin' ? 'admin' : 'clinical',
        })
        queueI693PatientFileSync(admin, encounterId, Number(enc.patient_id), formData, annotations, user.id)
        return NextResponse.json({
          success: true,
          annotations_persisted: false,
          data: { ...data, form_data: mergeI693Form(data.form_data as Partial<I693FormData>) },
        })
      }
      if (error) throw error
      await maybeSyncImmigrationCase(admin, encounterId)
      await logI693Audit('saved', encounterId, {
        patient_id: enc.patient_id,
        status,
        role,
        source: role === 'admin' ? 'admin' : 'clinical',
      })
      queueI693PatientFileSync(admin, encounterId, Number(enc.patient_id), formData, annotations, user.id)
      return NextResponse.json({
        success: true,
        annotations_persisted: true,
        data: { ...data, form_data: mergeI693Form(data.form_data as Partial<I693FormData>) },
      })
    }

    const inserted = await admin.from('i693_submissions').insert(rowWithAnnotations).select().single()
    let data = inserted.data
    let error = inserted.error
    let annotationsPersisted = true
    if (error && missingAnnotationsColumn(error)) {
      const retry = await admin.from('i693_submissions').insert(rowBase).select().single()
      data = retry.data
      error = retry.error
      annotationsPersisted = false
    }
    if (error) throw error
    await maybeSyncImmigrationCase(admin, encounterId)
    await logI693Audit('saved', encounterId, {
      patient_id: enc.patient_id,
      status,
      role,
      source: role === 'admin' ? 'admin' : 'clinical',
    })
    queueI693PatientFileSync(admin, encounterId, Number(enc.patient_id), formData, annotations, user.id)
    return NextResponse.json({
      success: true,
      annotations_persisted: annotationsPersisted,
      data,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
