import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireReleaseLogsManager } from '@/lib/release-logs/auth'
import { releaseLogUpdateSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

const RELEASE_LOG_SELECT =
  'id, task, description, status, sort_order, created_by, created_by_name, released_at, created_at, updated_at'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireReleaseLogsManager()
    const admin = createAdminClient()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = releaseLogUpdateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data
    if (v.task === undefined && v.description === undefined && v.status === undefined) {
      throw new ValidationError('No fields to update')
    }

    const patch: Record<string, unknown> = {}
    if (v.task !== undefined) patch.task = v.task
    if (v.description !== undefined) patch.description = v.description
    if (v.status !== undefined) {
      patch.status = v.status
      patch.released_at = v.status === 'released' ? new Date().toISOString() : null
    }

    const { data, error } = await admin
      .from('release_logs')
      .update(patch)
      .eq('id', params.id)
      .select(RELEASE_LOG_SELECT)
      .single()

    if (error) throw error
    if (!data) throw new ValidationError('Release log entry not found')

    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireReleaseLogsManager()
    const admin = createAdminClient()

    const { error } = await admin.from('release_logs').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ success: true, id: params.id })
  } catch (e) {
    return handleApiError(e)
  }
}
