import { createClient } from '@/lib/supabase/server'
import { getSupabasePublishableKey, getSupabaseSecretKey, getSupabaseUrl } from '@/lib/supabase/keys'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient, createClient as createSupabaseClient } from '@supabase/supabase-js'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

// Helper to extract user from custom cookie format
async function getUserFromCustomCookie(request: NextRequest) {
  const authCookie = request.cookies.get('supabase.auth.token')
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:10',message:'getUserFromCustomCookie called',data:{hasCookie:!!authCookie,hasValue:!!authCookie?.value,valueLength:authCookie?.value?.length||0},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (!authCookie?.value) return null

  try {
    // Cookie format: base64-{json}
    const base64Part = authCookie.value.replace('base64-', '')
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:16',message:'base64 decode attempt',data:{base64PartLength:base64Part.length,startsWithBase64:authCookie.value.startsWith('base64-')},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:18',message:'decoded string',data:{decodedLength:decoded.length,decodedPreview:decoded.substring(0,100)},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const sessionData = JSON.parse(decoded)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:19',message:'JSON parsed',data:{hasAccessToken:!!sessionData?.access_token,hasRefreshToken:!!sessionData?.refresh_token,hasUser:!!sessionData?.user,keys:Object.keys(sessionData||{})},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (sessionData?.access_token) {
      // Use the access token to get user
      const supabase = createSupabaseClient(
        getSupabaseUrl(),
        getSupabasePublishableKey(),
        {
          global: {
            headers: {
              Authorization: `Bearer ${sessionData.access_token}`,
            },
          },
        }
      )
      const { data: { user }, error } = await supabase.auth.getUser()
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:33',message:'getUser with token result',data:{hasUser:!!user,hasError:!!error,errorMessage:error?.message,userId:user?.id},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (!error && user) return user
    }
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:35',message:'cookie parse exception',data:{errorMessage:error instanceof Error?error.message:String(error),errorName:error instanceof Error?error.name:'unknown'},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    console.error('Error parsing custom cookie:', error)
  }
  return null
}

// This endpoint helps sync existing users to the profiles table for chat
export async function POST(request: NextRequest) {
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:73',message:'trying custom cookie parse as fallback',data:{authError:authError?.message},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        user = (await getUserFromCustomCookie(request)) ?? undefined
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:76',message:'custom cookie parse result',data:{gotUser:!!user,userId:user?.id},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      }
      
      if (!user) {
        console.error('Auth error in sync-profiles:', { sessionError, authError })
        console.error('Cookies:', request.cookies.getAll().map(c => ({ name: c.name, hasValue: !!c.value })))
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:82',message:'all auth methods failed',data:{sessionError:sessionError?.message,authError:authError?.message},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return NextResponse.json({ 
          error: 'Unauthorized', 
          details: sessionError?.message || authError?.message || 'Auth session missing!' 
        }, { status: 401 })
      }
    }
    
    // Check if user has a profile (allow doctors, nurses, and staff)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('uid', user.id)
      .single()

    // If profile doesn't exist, allow the sync (user might be syncing their own profile)
    // If profile exists, allow doctors, nurses, and staff
    if (profile && profile.role && !['doctor', 'nurse', 'staff'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only medical staff can sync profiles' }, { status: 403 })
    }

    // Use admin client to sync profiles
    const supabaseAdmin = createAdminClient(
      getSupabaseUrl(),
      getSupabaseSecretKey(),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get all auth users
    const { data: { users: authUsers }, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:125',message:'fetched auth users',data:{authUsersCount:authUsers?.length||0,hasError:!!usersError,errorMessage:usersError?.message},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (usersError) {
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Get existing profiles
    const { data: existingProfiles } = await supabaseAdmin
      .from('profiles')
      .select('uid')
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:133',message:'fetched existing profiles',data:{existingProfilesCount:existingProfiles?.length||0},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    const existingUids = new Set(existingProfiles?.map(p => p.uid) || [])

    // Get doctors and nurses to get their names
    const { data: doctors } = await supabaseAdmin.from('doctors').select('user_id, first_name, last_name, email')
    const { data: nurses } = await supabaseAdmin.from('nurses').select('user_id, first_name, last_name, email')

    const doctorsMap = new Map(doctors?.map(d => [d.user_id, d]) || [])
    const nursesMap = new Map(nurses?.map(n => [n.user_id, n]) || [])
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:143',message:'doctors and nurses fetched',data:{doctorsCount:doctors?.length||0,nursesCount:nurses?.length||0},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    let created = 0
    let errors = 0
    let skipped = 0

    // Create profiles for users that don't have them
    for (const authUser of authUsers) {
      if (existingUids.has(authUser.id)) {
        skipped++
        continue // Profile already exists
      }

      // Determine role from metadata or from doctors/nurses tables
      let role = authUser.user_metadata?.role || 'staff'
      let fullName = authUser.user_metadata?.name || authUser.user_metadata?.full_name || ''
      let email = authUser.email || ''

      // Check if user is in doctors table
      const doctor = doctorsMap.get(authUser.id)
      if (doctor) {
        role = 'doctor'
        fullName = `${doctor.first_name} ${doctor.last_name}`.trim() || fullName
        email = doctor.email || email
      } else {
        // Check if user is in nurses table
        const nurse = nursesMap.get(authUser.id)
        if (nurse) {
          role = 'nurse'
          fullName = `${nurse.first_name} ${nurse.last_name}`.trim() || fullName
          email = nurse.email || email
        }
      }

      // Create profile
      const profileData = {
        uid: authUser.id,
        role: role,
        full_name: fullName || authUser.email?.split('@')[0] || 'User',
        email: email,
        active: true,
      }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:178',message:'attempting to create profile',data:{userId:authUser.id,role,hasFullName:!!fullName,hasEmail:!!email},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      const { error: insertError } = await supabaseAdmin.from('profiles').insert(profileData)

      if (insertError) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:185',message:'profile insert error',data:{userId:authUser.id,errorCode:insertError?.code,errorMessage:insertError?.message,errorDetails:insertError?.details},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        console.error(`Error creating profile for ${authUser.id}:`, insertError)
        errors++
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:191',message:'profile created successfully',data:{userId:authUser.id,role},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        created++
      }
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/22fc7079-8256-4e49-b92c-672ebbf118b4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sync-profiles/route.ts:196',message:'sync complete',data:{totalAuthUsers:authUsers?.length||0,created,errors,skipped},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    return NextResponse.json({ 
      success: true, 
      created, 
      errors,
      skipped,
      message: `Created ${created} profiles${errors > 0 ? `, ${errors} errors` : ''}${skipped > 0 ? `, ${skipped} already exist` : ''}` 
    })
  } catch (error) {
    console.error('Error in sync-profiles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
