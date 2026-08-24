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
  _request: NextRequest,
  ctx: { params: Promise<{ roomName: string }> }
) {
  const user = await requireUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { roomName } = await ctx.params
  const result = await vonlinkageFetch(`/rooms/${encodeURIComponent(roomName)}/recordings`)
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
  const result = await vonlinkageFetch(`/rooms/${encodeURIComponent(roomName)}/recordings`, {
    method: 'POST',
    body,
  })
  return NextResponse.json(result, { status: result.status })
}
