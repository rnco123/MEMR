import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { handleApiError, AuthenticationError, AuthorizationError, ValidationError } from '@/lib/api-error-handler'
import { mergeI693Form } from '@/lib/i693/types'
import type { I693FormData } from '@/lib/i693/types'
import { normalizeI693FormAddress } from '@/lib/i693/ai-fill'
import { generateI693PdfBytes } from '@/lib/i693/generate-pdf'
import { persistI693PdfToPatientFile } from '@/lib/i693/save-patient-document'
import { isI693ApiRole } from '@/lib/immigration/api-auth'
import { findPatientI693Submission } from '@/lib/i693/patient-form'
import { guardI693EncounterAccess } from '@/lib/encounters/guard'
import { auditPhi } from '@/lib/audit-phi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; encounterId: string } }
) {
  try {
    const patientId = Number(params.id)
    const encounterId = Number(params.encounterId)
    if (!Number.isFinite(patientId) || !Number.isFinite(encounterId)) {
      throw new ValidationError('Invalid patient or encounter id')
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new AuthenticationError()

    const roleInfo = await fetchUserRole(supabase, user.id)
    if (!isI693ApiRole(roleInfo?.role)) throw new AuthorizationError()

    // Location-scoped access check: prevents fetching another clinic's I-693 PDF
    // by guessing patientId + encounterId. Returns admin client after the check.
    const admin = await guardI693EncounterAccess(user.id, encounterId)
    const sub =
      (await findPatientI693Submission(admin, patientId)) ??
      (
        await admin
          .from('i693_submissions')
          .select('form_data, pdf_storage_path, patient_id, encounter_id')
          .eq('encounter_id', encounterId)
          .eq('patient_id', patientId)
          .maybeSingle()
      ).data

    if (!sub) throw new ValidationError('I-693 form not found for this patient')

    // Serves the I-693 PDF bytes — covers both cached and regenerated paths below.
    auditPhi({
      user,
      role: roleInfo?.role,
      action: 'document_viewed',
      resourceType: 'document',
      resourceId: `i693-${encounterId}`,
      metadata: { type: 'i693_pdf', patient_id: patientId, encounter_id: encounterId },
      request,
    })

    const ownerEncounterId = sub.encounter_id ?? encounterId

    const formData = normalizeI693FormAddress(mergeI693Form(sub.form_data as Partial<I693FormData>))

    // Note: skip cached PDF if address normalization would change it
    if (sub.pdf_storage_path) {
      const { data: fileBlob, error: dlErr } = await admin.storage
        .from('patient-documents')
        .download(sub.pdf_storage_path)
      if (!dlErr && fileBlob) {
        const buf = Buffer.from(await fileBlob.arrayBuffer())
        return new NextResponse(buf, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="I-693-encounter-${encounterId}.pdf"`,
          },
        })
      }
    }

    const { bytes } = await generateI693PdfBytes(formData)

    await persistI693PdfToPatientFile(admin, patientId, ownerEncounterId, bytes, user.id).catch(() => {})

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="I-693-encounter-${encounterId}.pdf"`,
      },
    })
  } catch (e) {
    return handleApiError(e)
  }
}
