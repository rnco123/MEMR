import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

const VALID_ROLES = ['doctor', 'nurse', 'staff', 'patient'] as const

async function getUserFromRequest(request: Request): Promise<{ user: { id: string }; token?: string } | null> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (token) {
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user) return { user, token }
  }

  // M-04e: Use getUser() for verified server-side auth.
  const supabaseServer = await createServerClient()
  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser()
  if (userErr || !user) return null
  return { user }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getUserFromRequest(request)
    const user = authResult?.user ?? null

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase =
      authResult?.token
        ? createClient(config.supabase.url, config.supabase.anonKey, {
            global: { headers: { Authorization: `Bearer ${authResult.token}` } },
          })
        : await createServerClient()

    let body: unknown
    try {
      body = await request.json().catch(() => ({}))
    } catch {
      body = {}
    }

    const { encounterId, items } = body as {
      encounterId?: number
      items?: Array<{
        speaker_role?: string
        speaker_name?: string
        message?: string
        created_at?: string
      }>
    }

    const encounterIdNum = Number(encounterId)
    if (!encounterId || isNaN(encounterIdNum)) {
      return NextResponse.json({ error: 'Invalid encounterId' }, { status: 400 })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 })
    }

    const rows = items.map((t) => {
      const role = VALID_ROLES.includes(t.speaker_role as (typeof VALID_ROLES)[number])
        ? t.speaker_role
        : 'patient'
      return {
        encounter_id: encounterIdNum,
        speaker_role: role,
        speaker_name: String(t.speaker_name ?? 'Unknown').trim() || 'Unknown',
        message: String(t.message ?? '').trim() || '',
      }
    })

    const invalid = rows.filter((r) => !r.message)
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'Each item must have a non-empty message' }, { status: 400 })
    }

    let userRole: string | undefined
    const { data: profileByUid } = await supabase
      .from('profiles')
      .select('role')
      .eq('uid', user.id)
      .maybeSingle()
    if (profileByUid?.role) userRole = profileByUid.role as string
    if (!userRole) {
      const { data: profileById } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      userRole = profileById?.role as string | undefined
    }

    const { data: enc, error: encErr } = await supabase
      .from('encounters')
      .select('id, doctor_id')
      .eq('id', encounterIdNum)
      .maybeSingle()

    if (encErr || !enc) {
      return NextResponse.json({ error: 'Encounter not found' }, { status: 404 })
    }

    if (userRole === 'doctor') {
      const { data: doctorRow } = await supabase
        .from('doctors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!doctorRow?.id || enc.doctor_id !== doctorRow.id) {
        return NextResponse.json(
          { error: 'Not authorized to save transcript for this encounter' },
          { status: 403 }
        )
      }
    } else if (userRole === 'nurse' || userRole === 'staff') {
      // Nurses/staff may record the session; encounter must exist (checked above).
    } else {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: inserted, error } = await admin
      .from('telemedicine_transcripts')
      .insert(rows)
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const ids = (inserted ?? []).map((r) => Number(r.id)).filter((n) => !isNaN(n))
    if (ids.length !== rows.length) {
      return NextResponse.json(
        { error: 'Insert did not return all row ids' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, ids })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
