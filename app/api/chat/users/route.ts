import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch staff profiles
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('uid, full_name, role, email, active')
      .neq('uid', user.id)
      .in('role', ['doctor', 'nurse', 'staff'])
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