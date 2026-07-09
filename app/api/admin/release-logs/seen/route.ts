import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'
import { isReleaseLogsManager } from '@/lib/release-logs/auth'
import { fetchProfileFields } from '@/lib/fetch-user-role'

export const dynamic = 'force-dynamic'

/** Whether any release log entry has changed since the given timestamp (or ever, if null). */
async function hasActivitySince(admin: ReturnType<typeof createAdminClient>, sinceIso: string | null) {
  let query = admin.from('release_logs').select('id', { count: 'exact', head: true })
  if (sinceIso) query = query.gt('updated_at', sinceIso)
  const { count, error } = await query
  if (error) throw error
  return (count ?? 0) > 0
}

export async function GET() {
  try {
    const user = await requireAdminUser()

    // The manager always knows what's in the log (they made the changes) — no badge for them.
    if (isReleaseLogsManager(user)) {
      return NextResponse.json({ hasUnseen: false })
    }

    const admin = createAdminClient()
    const profile = await fetchProfileFields(admin, user.id, 'release_logs_seen_at', { email: user.email })
    const seenAt = typeof profile?.release_logs_seen_at === 'string' ? profile.release_logs_seen_at : null

    const hasUnseen = await hasActivitySince(admin, seenAt)
    return NextResponse.json({ hasUnseen })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST() {
  try {
    const user = await requireAdminUser()
    const admin = createAdminClient()
    const now = new Date().toISOString()

    const byId = await admin.from('profiles').update({ release_logs_seen_at: now }).eq('id', user.id).select('id')
    if (byId.error) throw byId.error

    if (!byId.data || byId.data.length === 0) {
      const byUid = await admin
        .from('profiles')
        .update({ release_logs_seen_at: now })
        .eq('uid', user.id)
        .select('uid')
      if (byUid.error) throw byUid.error
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
