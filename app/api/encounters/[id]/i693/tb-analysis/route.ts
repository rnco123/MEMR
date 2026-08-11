import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchUserRole } from '@/lib/fetch-user-role'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '@/lib/api-error-handler'
import { isI693ApiRole } from '@/lib/immigration/api-auth'
import { guardI693EncounterAccess } from '@/lib/encounters/guard'
import { resolveEncounterPatientId } from '@/lib/encounters/resolve-patient-id'
import {
  extractQftValuesFromPdf,
  TB_ANALYSIS_MAX_PDF_BYTES,
  TbAnalysisConfigError,
  TbAnalysisExtractionError,
} from '@/lib/i693/tb-analysis/extract-qft-values'
import { classifyQuantiferon } from '@/lib/i693/tb-analysis/qft-rules'
import { logI693Audit } from '@/lib/i693/audit-log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Analyze an attached QuantiFERON-TB report.
 *
 * The report is posted as multipart/form-data — it is never persisted; the bytes go to the
 * model, the values come back, and the classification is decided by `classifyQuantiferon`.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
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

    const admin = await guardI693EncounterAccess(user.id, encounterId)

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new ValidationError('Attach the TB report as multipart/form-data')
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) throw new ValidationError('No report file was attached')

    const fileName = file.name.toLowerCase()
    if (file.type.toLowerCase() !== 'application/pdf' && !fileName.endsWith('.pdf')) {
      throw new ValidationError('The TB report must be a PDF')
    }
    if (file.size > TB_ANALYSIS_MAX_PDF_BYTES) {
      throw new ValidationError('Report is too large to analyze')
    }

    const { data: encounter, error: encounterError } = await admin
      .from('encounters')
      .select('id, patient_id, appointment_id')
      .eq('id', encounterId)
      .maybeSingle()
    if (encounterError) throw encounterError
    if (!encounter) throw new NotFoundError('Encounter not found')

    const patientId = await resolveEncounterPatientId(admin, encounter)

    const pdfBytes = new Uint8Array(await file.arrayBuffer())
    const { values, model } = await extractQftValuesFromPdf(pdfBytes, { fileName: file.name })

    const isQuantiferon = values.assay === 'quantiferon_plus' || values.assay === 'quantiferon_other'

    // QFT-Plus cut-offs don't apply to T-SPOT or non-IGRA documents.
    const result = isQuantiferon
      ? classifyQuantiferon(
          {
            nil: { value: values.nil, raw: values.raw.nil },
            tb1Nil: { value: values.tb1_nil, raw: values.raw.tb1_nil },
            tb2Nil: { value: values.tb2_nil, raw: values.raw.tb2_nil },
            mitogenNil: { value: values.mitogen_nil, raw: values.raw.mitogen_nil },
          },
          values.extraction_confidence
        )
      : {
          classification: 'Unable to Determine' as const,
          confidence: 0,
          borderline: false,
          rule: 'not_a_quantiferon_report',
          reasons: [
            values.assay === 'tspot'
              ? 'This is a T-SPOT.TB report; the QuantiFERON interpretation criteria do not apply.'
              : 'This document does not appear to be a QuantiFERON report.',
          ],
          missing: [],
        }

    await logI693Audit('viewed', encounterId, {
      patient_id: patientId,
      role: roleInfo?.role ?? undefined,
      ai_model: model,
    })

    return NextResponse.json({
      classification: result.classification,
      confidence: result.confidence,
      borderline: result.borderline,
      rule: result.rule,
      reasons: result.reasons,
      missing: result.missing,
      assay: values.assay,
      units: values.units,
      values: {
        nil: values.nil,
        tb1_nil: values.tb1_nil,
        tb2_nil: values.tb2_nil,
        mitogen_nil: values.mitogen_nil,
        raw: values.raw,
      },
      specimen_collected_on: values.specimen_collected_on,
      notes: values.notes,
      model,
      document: { file_name: file.name },
    })
  } catch (e) {
    if (e instanceof TbAnalysisConfigError) {
      return NextResponse.json({ error: 'TB analysis is not configured' }, { status: 503 })
    }
    if (e instanceof TbAnalysisExtractionError) {
      return handleApiError(new ValidationError(e.message))
    }
    return handleApiError(e)
  }
}
