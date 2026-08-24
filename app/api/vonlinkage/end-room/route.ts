import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isClinicalStaffRole } from '@/lib/roles'
import { vonlinkageFetch } from '@/lib/vonlinkage'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabaseServer = await createServerClient()
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body
    try {
      body = await request.json().catch(() => ({}))
    } catch {
      body = {}
    }

    const { encounterId } = body

    if (encounterId == null) {
      return NextResponse.json({ error: 'encounterId is required' }, { status: 400 })
    }

    const encounterIdNum = Number(encounterId)
    if (isNaN(encounterIdNum)) {
      return NextResponse.json({ error: 'Invalid encounter ID' }, { status: 400 })
    }

    let profileData: { role?: string } | null = null
    const byId = await supabaseServer.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (byId.data) profileData = byId.data
    if (!profileData) {
      const byUid = await supabaseServer.from('profiles').select('role').eq('uid', user.id).maybeSingle()
      if (byUid.data) profileData = byUid.data
    }

    const role = profileData?.role as string | null
    if (!isClinicalStaffRole(role)) {
      return NextResponse.json(
        { error: 'Not allowed to end telemedicine session' },
        { status: 403 }
      )
    }

    const roomName = `encounter-${encounterIdNum}`

    // Best-effort delete: if the room doesn't exist, ignore the error (204/404 both fine).
    const result = await vonlinkageFetch(`/rooms/${encodeURIComponent(roomName)}`, {
      method: 'DELETE',
    })

    if (!result.ok && result.status !== 404) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to delete VonLinkage room:', result.status, result.error)
      }
      return NextResponse.json(
        { success: false, warning: 'Room delete failed', status: result.status },
        { status: 200 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[vonlinkage/end-room]', error)
    Sentry.captureException(error, { tags: { route: 'vonlinkage-end-room' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
