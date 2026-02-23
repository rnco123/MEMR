import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Helper to get access token from custom cookie
function getAccessTokenFromCookie(request: NextRequest): string | null {
  const authCookie = request.cookies.get('supabase.auth.token')
  if (!authCookie?.value) return null

  try {
    const base64Part = authCookie.value.replace('base64-', '')
    const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')
    const sessionData = JSON.parse(decoded)
    return sessionData?.access_token || null
  } catch (error) {
    console.error('Error parsing custom cookie:', error)
    return null
  }
}

// Helper to get Supabase client with proper authentication
async function getAuthenticatedSupabaseClient(request: NextRequest) {
  const supabase = await createClient()
  
  // Try to get session first
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      }
    )
  }
  
  // Fallback to custom cookie
  const token = getAccessTokenFromCookie(request)
  if (token) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    )
  }
  
  // Last resort: return the server client (might not work with RLS)
  return supabase
}

// Helper to extract user from custom cookie format
async function getUserFromCustomCookie(request: NextRequest) {
  const token = getAccessTokenFromCookie(request)
  if (!token) return null

  try {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    )
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user) return user
  } catch (error) {
    console.error('Error getting user from token:', error)
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Try to get session first (works better with cookies)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    let user = session?.user
    
    if (!user) {
      // Fallback to getUser if getSession fails
      const { data: { user: getUserResult }, error: authError } = await supabase.auth.getUser()
      
      if (getUserResult) {
        user = getUserResult
      } else {
        // If getUser also failed, try parsing custom cookie format as last resort
        user = (await getUserFromCustomCookie(request)) ?? undefined
      }
      
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Get authenticated Supabase client for queries (ensures RLS works correctly)
    const authenticatedSupabase = await getAuthenticatedSupabaseClient(request)

    // Fetch staff profiles (filtered)
    const { data: profiles, error } = await authenticatedSupabase
      .from('profiles')
      .select('uid, full_name, role, email, active')
      .neq('uid', user.id)
      .in('role', ['doctor', 'nurse', 'staff'])
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
        { error: `Failed to fetch users: ${error.message}` },
        { status: 500 }
      )
    }

    console.log(`Found ${profiles?.length || 0} users for chat`)
    console.log('User IDs found:', profiles?.map(p => p.uid).join(', '))
    
    return NextResponse.json({ users: profiles || [] })
  } catch (error) {
    console.error('Error in GET /api/chat/users:', error)
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