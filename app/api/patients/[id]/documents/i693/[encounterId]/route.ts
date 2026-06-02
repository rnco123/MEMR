import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { handleApiError, AuthenticationError, AuthorizationError, ValidationError } from '@/lib/api-error-handler'
import { mergeI693Form } from '@/lib/i693/types'
import type { I693FormData } from '@/lib/i693/types'
import { generateI693PdfBytes } from '@/lib/i693/generate-pdf'
import { persistI693PdfToPatientFile } from '@/lib/i693/save-patient-document'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED = new Set(['doctor', 'nurse', 'staff', 'admin'])

export async function GET(
  _request: NextRequest,
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
    const role = roleInfo?.role?.toLowerCase()
    if (!role || !ALLOWED.has(role)) throw new AuthorizationError()

    const admin = createAdminClient()
    const { data: sub, error } = await admin
      .from('i693_submissions')
      .select('form_data, pdf_storage_path, patient_id')
      .eq('encounter_id', encounterId)
      .eq('patient_id', patientId)
      .maybeSingle()

    if (error) throw error
    if (!sub) throw new ValidationError('I-693 form not found for this encounter')

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

    const formData = mergeI693Form(sub.form_data as Partial<I693FormData>)
    const { bytes } = await generateI693PdfBytes(formData)

    await persistI693PdfToPatientFile(admin, patientId, encounterId, bytes, user.id).catch(() => {})

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
