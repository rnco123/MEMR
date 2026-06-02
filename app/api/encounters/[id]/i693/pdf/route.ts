import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { handleApiError, AuthenticationError, AuthorizationError, ValidationError } from '@/lib/api-error-handler'
import { mergeI693Form } from '@/lib/i693/types'
import type { I693FormData } from '@/lib/i693/types'
import { generateI693PdfBytes } from '@/lib/i693/generate-pdf'
import { persistI693PdfToPatientFile } from '@/lib/i693/save-patient-document'
import { isI693ApiRole } from '@/lib/immigration/api-auth'
import { logI693Audit } from '@/lib/i693/audit-log'
import { parseI693Annotations } from '@/lib/i693/annotations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function missingAnnotationsColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string }
  return e.code === '42703' || Boolean(e.message?.toLowerCase().includes('annotations'))
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

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isI693ApiRole(roleInfo?.role)) throw new AuthorizationError()
    const role = roleInfo!.role!.trim().toLowerCase()

    const admin = createAdminClient()
    const selected = await admin
      .from('i693_submissions')
      .select('form_data, patient_id, annotations')
      .eq('encounter_id', encounterId)
      .maybeSingle()
    let sub = selected.data
    let error = selected.error
    if (error && missingAnnotationsColumn(error)) {
      const retry = await admin
        .from('i693_submissions')
        .select('form_data, patient_id')
        .eq('encounter_id', encounterId)
        .maybeSingle()
      sub = retry.data as typeof sub
      error = retry.error
    }
    if (error) throw error
    if (!sub) throw new ValidationError('Save the I-693 form before exporting PDF')

    const formData = mergeI693Form(sub.form_data as Partial<I693FormData>)
    const annotations = parseI693Annotations(sub.annotations)
    const { bytes, mode, filledFields, missingFields } = await generateI693PdfBytes(formData, annotations)

    const patientId = sub.patient_id as number
    if (Number.isFinite(patientId)) {
      await persistI693PdfToPatientFile(admin, patientId, encounterId, bytes, user.id).catch(
        (err) => console.error('[i693/pdf] persist to patient file:', err)
      )
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
        'X-I693-Pdf-Mode': mode,
        ...(filledFields?.length ? { 'X-I693-Filled-Fields': String(filledFields.length) } : {}),
        ...(missingFields?.length ? { 'X-I693-Missing-Fields': String(missingFields.length) } : {}),
      },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
