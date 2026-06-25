import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  AuthenticationError,
  ValidationError,
  handleApiError,
} from '@/lib/api-error-handler'
import {
  loadComplianceReviewDetail,
  saveComplianceReview,
} from '@/lib/compliance/load-compliance-dashboard'
import { requireComplianceAccess } from '@/lib/compliance/require-compliance-access'
import type { PhysicianReviewStatus } from '@/lib/compliance/physician-review'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const reviewSaveSchema = z.object({
  review_status: z.enum(['reviewed', 'consult_concluded', 'physician_signed', 'pending']),
  notes: z.string().optional().nullable(),
  findings: z.string().optional().nullable(),
})

function parseEncounterId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid encounter id')
  return id
}

export async function GET(_request: Request, { params }: { params: { encounterId: string } }) {
  try {
    const session = await requireComplianceAccess()
    const encounterId = parseEncounterId(params.encounterId)
    const admin = createAdminClient()
    const detail = await loadComplianceReviewDetail(admin, encounterId, session.locationScope)
    if (!detail) throw new ValidationError('Review record not found for this encounter')
    return NextResponse.json(detail)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(request: Request, { params }: { params: { encounterId: string } }) {
  try {
    const session = await requireComplianceAccess()
    if (!session.user?.id) throw new AuthenticationError()

    const encounterId = parseEncounterId(params.encounterId)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = reviewSaveSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const admin = createAdminClient()
    await saveComplianceReview(admin, {
      encounterId,
      reviewerUserId: session.user.id,
      reviewStatus: parsed.data.review_status as PhysicianReviewStatus,
      notes: parsed.data.notes,
      findings: parsed.data.findings,
      locationScope: session.locationScope,
    })

    const detail = await loadComplianceReviewDetail(admin, encounterId, session.locationScope)
    return NextResponse.json(detail)
  } catch (err) {
    return handleApiError(err)
  }
}
