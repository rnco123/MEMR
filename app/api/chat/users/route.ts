import { CHAT_ELIGIBLE_ROLES, getChatSupabaseClient, resolveChatUser } from '@/lib/chat/auth'
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

    const authenticatedSupabase = await getChatSupabaseClient(request)

    // 1:1 directory — other active staff only (never self)
    const { data: profiles, error } = await authenticatedSupabase
      .from('profiles')
      .select('uid, full_name, role, email, active')
      .neq('uid', user.id)
      .in('role', [...CHAT_ELIGIBLE_ROLES])
      .eq('active', true)
      .order('full_name', { ascending: true, nullsFirst: false })

    if (error) {
      console.error('Error fetching users:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      console.error('Current user ID:', user.id)
      
      // If RLS is blocking, provide helpful error message
      if (error.message?.includes('policy') || error.code === '42501') {
        return NextResponse.json(
          { 
            error: 'RLS policy blocking access. Please ensure "Authenticated users can view profiles" policy exists.' 
          },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      )
    }

    return NextResponse.json({ users: profiles || [] })
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
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: statusCode }
    )
  }
}