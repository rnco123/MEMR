import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
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

  const supabaseServer = await createServerClient()
  const { data: { session } } = await supabaseServer.auth.getSession()
  const user = session?.user ?? null
  return user ? { user, token: session?.access_token ?? undefined } : null
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

    const { error } = await supabase.from('telemedicine_transcripts').insert(rows)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
