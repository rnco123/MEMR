import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { renderConsentFormHtml } from '@/lib/forms/render-consent-html'
import {
  normalizeStoragePath,
  parseFormPathsRaw,
} from '@/lib/forms/signature-paths'

export const dynamic = 'force-dynamic'

const BUCKET = 'patient_consent_forms'
const ALLOWED_ROLES = new Set(['nurse', 'staff', 'doctor'])

export type ConsentFormPayload = {
  id: number
  name: string
  html: string
  updated_at: string | null
}

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

    const admin = createAdminClient()

    const { data: enc, error: encErr } = await admin
      .from('encounters')
      .select('id, patient_id, appointment_id')
      .eq('id', encounterId)
      .maybeSingle()

    if (encErr || !enc) {
      return NextResponse.json({ error: 'Encounter not found' }, { status: 404 })
    }

    /** Encounters sometimes omit patient_id; appointments always carry the patient for the visit. */
    let resolvedPatientId: number | string | null =
      enc.patient_id != null && enc.patient_id !== '' ? (enc.patient_id as number | string) : null
    if (resolvedPatientId == null && enc.appointment_id) {
      const { data: apptRow } = await admin
        .from('appointments')
        .select('patient_id')
        .eq('id', enc.appointment_id)
        .maybeSingle()
      const pid = apptRow?.patient_id as number | string | null | undefined
      if (pid != null && pid !== '') {
        resolvedPatientId = pid
      }
    }

    let patientName = 'Patient'
    let dateOfBirthDisplay = '—'
    if (resolvedPatientId != null) {
      const { data: pat } = await admin
        .from('patients')
        .select('first_name, last_name, date_of_birth')
        .eq('id', resolvedPatientId)
        .maybeSingle()
      if (pat) {
        patientName = [pat.first_name, pat.last_name].filter(Boolean).join(' ').trim() || patientName
        const raw = pat.date_of_birth as string | null | undefined
        if (raw) {
          try {
            dateOfBirthDisplay = new Date(raw).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          } catch {
            dateOfBirthDisplay = raw
          }
        }
      }
    }

    let dateDisplay = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
    if (enc.appointment_id) {
      const { data: appt } = await admin
        .from('appointments')
        .select('appointment_date')
        .eq('id', enc.appointment_id)
        .maybeSingle()
      if (appt?.appointment_date) {
        try {
          dateDisplay = new Date(appt.appointment_date as string).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        } catch {
          /* keep default */
        }
      }
    }

    const { data: signedRow } = await admin
      .from('signed_forms')
      .select('form_paths')
      .eq('encounter_id', encounterId)
      .maybeSingle()

    const parsed = parseFormPathsRaw(signedRow?.form_paths ?? null)
    let patientPath = normalizeStoragePath(encounterId, parsed.patientRelative)
    const physicianPath = normalizeStoragePath(encounterId, parsed.physicianRelative)

    const publicUrl = (fullPath: string | null) => {
      if (!fullPath) return null
      const { data } = admin.storage.from(BUCKET).getPublicUrl(fullPath)
      return data.publicUrl ?? null
    }

    let patientSigUrl = publicUrl(patientPath)
    const physicianSigUrl = publicUrl(physicianPath)

    if (!patientSigUrl) {
      const { data: files, error: listErr } = await admin.storage.from(BUCKET).list(String(encounterId), {
        limit: 50,
      })
      if (!listErr && files?.length) {
        const img = files.find(
          (f) => f.name && !f.name.endsWith('/') && /\.(jpe?g|png|webp)$/i.test(f.name)
        )
        if (img) {
          patientPath = `${encounterId}/${img.name}`
          patientSigUrl = publicUrl(patientPath)
        }
      }
    }

    const { data: formRows, error: formsErr } = await admin
      .from('forms')
      .select('id, name, content, created_at')
      .eq('is_active', true)
      .order('id', { ascending: true })

    if (formsErr) {
      console.error('[consent-forms] forms query', formsErr)
      return NextResponse.json({ error: 'Forms table unavailable', detail: formsErr.message }, { status: 500 })
    }

    const forms: ConsentFormPayload[] = []
    for (const row of formRows ?? []) {
      const content = row.content as { html?: string; updated_at?: string } | null
      const rawHtml = content?.html
      if (typeof rawHtml !== 'string' || !rawHtml.trim()) continue

      const html = renderConsentFormHtml(rawHtml, {
        patientName,
        dateDisplay,
        dateOfBirthDisplay,
        patientSignatureUrl: patientSigUrl,
        physicianSignatureUrl: physicianSigUrl,
      })

      forms.push({
        id: Number(row.id),
        name: String(row.name ?? `Form ${row.id}`),
        html,
        updated_at: content?.updated_at ?? null,
      })
    }

    return NextResponse.json({
      patientName,
      dateDisplay,
      dateOfBirthDisplay,
      signaturePaths: { patient: patientPath, physician: physicianPath },
      forms,
    })
  } catch (e) {
    console.error('[consent-forms]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
