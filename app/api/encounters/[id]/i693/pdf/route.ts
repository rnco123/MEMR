import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { handleApiError, AuthenticationError, AuthorizationError, ValidationError } from '@/lib/api-error-handler'
import { mergeI693Form } from '@/lib/i693/types'
import type { I693FormData } from '@/lib/i693/types'
import { normalizeI693FormAddress } from '@/lib/i693/ai-fill'
import { generateI693PdfBytes } from '@/lib/i693/generate-pdf'
import { persistI693PdfToPatientFile } from '@/lib/i693/save-patient-document'
import { loadEncounterImmigrationContext } from '@/lib/i693/immigration-eligibility'
import { isI693ApiRole } from '@/lib/immigration/api-auth'
import { logI693Audit } from '@/lib/i693/audit-log'
import { findPatientI693Submission } from '@/lib/i693/patient-form'

import { guardI693EncounterAccess } from '@/lib/encounters/guard'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: { id: string } }) {
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
      .select('patient_id')
      .eq('id', encounterId)
      .maybeSingle()
    if (encErr) throw encErr
    if (!enc?.patient_id) throw new ValidationError('Encounter not found')

    const sub = await findPatientI693Submission(admin, Number(enc.patient_id))
    if (!sub) throw new ValidationError('Save the I-693 form before exporting PDF')

    const formData = normalizeI693FormAddress(mergeI693Form(sub.form_data as Partial<I693FormData>))
    const isPreviewOnly = new URL(request.url).searchParams.get('preview') === '1'
    const { bytes, mode, filledFields, missingFields } = await generateI693PdfBytes(formData)

    const patientId = sub.patient_id
    const ownerEncounterId = sub.encounter_id
    if (!isPreviewOnly && Number.isFinite(patientId)) {
      const ctx = await loadEncounterImmigrationContext(admin, encounterId)
      if (ctx?.isImmigration) {
        await persistI693PdfToPatientFile(admin, patientId, ownerEncounterId, bytes, user.id)
      }
    }

    await logI693Audit('pdf_exported', encounterId, {
      patient_id: patientId,
      role,
      pdf_mode: mode,
      source: role === 'admin' ? 'admin' : 'clinical',
    })

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="I-693-encounter-${encounterId}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-I693-Pdf-Mode': mode,
        ...(filledFields?.length ? { 'X-I693-Filled-Fields': String(filledFields.length) } : {}),
        ...(missingFields?.length ? { 'X-I693-Missing-Fields': String(missingFields.length) } : {}),
      },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
