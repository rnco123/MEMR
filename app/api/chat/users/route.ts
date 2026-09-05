import { CHAT_ELIGIBLE_ROLES, getChatSupabaseClient, resolveChatUser } from '@/lib/chat/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { getLocationScopeForUser } from '@/lib/locations/scope'
import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest) {
  try {
    const user = await resolveChatUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const roleInfo = await fetchUserRole(admin, user.id)
    const userRole = roleInfo?.role ?? 'nurse'

    // Determine location scope for current user
    const scope = await getLocationScopeForUser(admin, user.id, userRole)

    let allowedUserIds: Set<string> | null = null

    if (!scope.unrestricted) {
      allowedUserIds = new Set<string>()

      if (scope.locationIds.length > 0) {
        const [ulRes, docRes, nurseRes] = await Promise.all([
          admin.from('user_locations').select('user_uid').in('location_id', scope.locationIds),
          admin.from('doctors').select('user_id').in('location_id', scope.locationIds),
          admin.from('nurses').select('user_id').in('location_id', scope.locationIds),
        ])

        ;(ulRes.data ?? []).forEach((r) => {
          if (r.user_uid) allowedUserIds!.add(r.user_uid)
        })
        ;(docRes.data ?? []).forEach((r) => {
          if (r.user_id) allowedUserIds!.add(r.user_id)
        })
        ;(nurseRes.data ?? []).forEach((r) => {
          if (r.user_id) allowedUserIds!.add(r.user_id)
        })
      }
    }

    const authenticatedSupabase = await getChatSupabaseClient(request)

    // Fetch active staff in eligible roles
    const { data: profiles, error } = await authenticatedSupabase
      .from('profiles')
      .select('uid, full_name, role, email, active')
      .neq('uid', user.id)
      .in('role', [...CHAT_ELIGIBLE_ROLES])
      .eq('active', true)
      .order('full_name', { ascending: true, nullsFirst: false })

    if (error) {
      console.error('Error fetching users:', error)
      if (error.message?.includes('policy') || error.code === '42501') {
        return NextResponse.json(
          {
            error:
              'RLS policy blocking access. Please ensure "Authenticated users can view profiles" policy exists.',
          },
          { status: 403 }
        )
      }
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Filter users: Admins see all users; Non-admins see Admins + users in their same location(s).
    // Other admin accounts still exist in the DB but only this one belongs in the chat directory.
    const VISIBLE_ADMIN_EMAIL = 'mack@myclinicmd.com'
    const filteredUsers = (profiles || []).filter((p) => {
      if (p.role === 'admin') {
        return (p.email ?? '').toLowerCase() === VISIBLE_ADMIN_EMAIL
      }
      if (scope.unrestricted) return true
      return allowedUserIds ? allowedUserIds.has(p.uid) : false
    })

    return NextResponse.json({ users: filteredUsers })
  } catch (error) {
    console.error('Error in GET /api/chat/users:', error)
    Sentry.captureException(error, { tags: { route: 'chat-users' } })
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    const statusCode = errorMessage.includes('RLS') ? 403 : 500

    return NextResponse.json(
      {
        error: errorMessage.includes('RLS')
          ? 'RLS policy blocking access. Please ensure "Authenticated users can view profiles" policy exists.'
          : 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: statusCode }
    )
  }
}