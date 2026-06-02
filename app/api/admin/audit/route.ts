import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api-error-handler'
import { requireAdminUser } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await requireAdminUser()
    const admin = createAdminClient()

    const { searchParams } = req.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
    const action = searchParams.get('action') ?? ''
    const role = searchParams.get('role') ?? ''
    const search = searchParams.get('search') ?? ''
    const from = searchParams.get('from') ?? ''
    const to = searchParams.get('to') ?? ''

    let query = admin
      .from('audit_logs')
      .select(
        'id, user_id, user_email, user_name, user_role, action, resource_type, resource_id, page_url, ip_address, user_agent, metadata, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (action) query = query.eq('action', action)
    if (role) query = query.eq('user_role', role)
    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', to)
    if (search) {
      query = query.or(
        `user_email.ilike.%${search}%,user_name.ilike.%${search}%,action.ilike.%${search}%,resource_type.ilike.%${search}%`
      )
    }

    // Enrich with profile data for any rows missing user_name/user_email
    const { data, count, error } = await query
    if (error) throw error

    // For rows that have user_id but no snapshot, look up from profiles
    const missingIds = (data ?? [])
      .filter((r) => r.user_id && !r.user_email)
      .map((r) => r.user_id as string)
    const uniqueMissing = [...new Set(missingIds)]

    const profileMap: Record<string, { full_name: string | null; email: string | null; role: string | null }> = {}
    if (uniqueMissing.length) {
      const { data: profs } = await admin
        .from('profiles')
        .select('uid, full_name, email, role')
        .in('uid', uniqueMissing)
      for (const p of profs ?? []) {
        profileMap[p.uid] = { full_name: p.full_name, email: p.email, role: p.role }
      }
    }

    const enriched = (data ?? []).map((r) => {
      if (r.user_id && !r.user_email) {
        const p = profileMap[r.user_id]
        if (p) {
          return { ...r, user_name: r.user_name ?? p.full_name, user_email: r.user_email ?? p.email, user_role: r.user_role ?? p.role }
        }
      }
      return r
    })

    return NextResponse.json({ rows: enriched, total: count ?? 0, page, limit })
  } catch (err) {
    return handleApiError(err)
  }
}
