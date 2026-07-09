import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ValidationError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { requireReleaseLogsManager } from '@/lib/release-logs/auth'
import { releaseLogCreateSchema } from '@/lib/validation'
import type { ReleaseLogStatus } from '@/lib/release-logs/types'

export const dynamic = 'force-dynamic'

const RELEASE_LOG_SELECT =
  'id, task, description, status, sort_order, created_by, created_by_name, released_at, created_at, updated_at'

function parseStatus(raw: string | null): ReleaseLogStatus | null {
  return raw === 'upcoming' || raw === 'released' ? raw : null
}

export async function GET(request: Request) {
  try {
    await requireAdminUser()
    const admin = createAdminClient()
    const status = parseStatus(new URL(request.url).searchParams.get('status'))

    let query = admin
      .from('release_logs')
      .select(RELEASE_LOG_SELECT)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data: data ?? [] })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireReleaseLogsManager()
    const admin = createAdminClient()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }

    const parsed = releaseLogCreateSchema.safeParse(body)
    if (!parsed.success) throw parsed.error

    const v = parsed.data
    const now = new Date().toISOString()
    const createdByName = user.user_metadata?.full_name || user.user_metadata?.name || user.email

    const { data, error } = await admin
      .from('release_logs')
      .insert({
        task: v.task,
        description: v.description ?? null,
        status: v.status,
        created_by: user.id,
        created_by_name: createdByName,
        released_at: v.status === 'released' ? now : null,
      })
      .select(RELEASE_LOG_SELECT)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (e) {
    return handleApiError(e)
  }
}
