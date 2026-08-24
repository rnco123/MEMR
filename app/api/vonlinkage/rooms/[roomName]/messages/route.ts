import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { vonlinkageFetch } from '@/lib/vonlinkage'

export const dynamic = 'force-dynamic'

async function requireUser() {
  const supabaseServer = await createServerClient()
  const { data: { user }, error } = await supabaseServer.auth.getUser()
  if (error || !user) return null
  return user
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ roomName: string }> }
) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { roomName } = await ctx.params
  const { searchParams } = new URL(request.url)
  const qs = new URLSearchParams()
  const limit = searchParams.get('limit')
  const before = searchParams.get('before')
  if (limit) qs.set('limit', limit)
  if (before) qs.set('before', before)
  const query = qs.toString() ? `?${qs.toString()}` : ''

  const result = await vonlinkageFetch(`/rooms/${encodeURIComponent(roomName)}/messages${query}`)
  return NextResponse.json(result, { status: result.status })
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ roomName: string }> }
) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { roomName } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const idempotencyKey = request.headers.get('Idempotency-Key') ?? crypto.randomUUID()

  const result = await vonlinkageFetch(`/rooms/${encodeURIComponent(roomName)}/messages`, {
    method: 'POST',
    body,
    idempotencyKey,
  })
  return NextResponse.json(result, { status: result.status })
}
