import { createClient } from '@/lib/supabase/server'
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/keys'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

// Helper to extract user from custom cookie format
async function getUserFromCustomCookie(request: NextRequest) {
  const authCookie = request.cookies.get('supabase.auth.token')
  if (!authCookie?.value) return null

  try {
    const base64Part = authCookie.value.replace('base64-', '')
    const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')
    const sessionData = JSON.parse(decoded)
    
    if (sessionData?.access_token) {
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
      if (!error && user) return user
    }
  } catch (error) {
    console.error('Error parsing custom cookie:', error)
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

    // Fetch all conversations for the current user
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        id,
        participant1_id,
        participant2_id,
        last_message_at,
        created_at,
        updated_at
      `)
      .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch conversations: ${error.message}` },
        { status: 500 }
      )
    }

    // Get unique participant IDs
    const participantIds = new Set<string>()
    conversations?.forEach(conv => {
      if (conv.participant1_id !== user.id) participantIds.add(conv.participant1_id)
      if (conv.participant2_id !== user.id) participantIds.add(conv.participant2_id)
    })

    // Fetch profile information for all participants
    const { data: profiles } = await supabase
      .from('profiles')
      .select('uid, full_name, role, email')
      .in('uid', Array.from(participantIds))

    // Map profiles by uid
    const profilesMap = new Map(profiles?.map(p => [p.uid, p]) || [])

    // Enrich conversations with participant info
    const enrichedConversations = conversations?.map(conv => {
      const otherParticipantId = conv.participant1_id === user.id 
        ? conv.participant2_id 
        : conv.participant1_id
      const profile = profilesMap.get(otherParticipantId)
      
      return {
        ...conv,
        other_participant: {
          id: otherParticipantId,
          full_name: profile?.full_name || 'Unknown',
          role: profile?.role || 'unknown',
          email: profile?.email || null,
        }
      }
    }) || []

    return NextResponse.json({ conversations: enrichedConversations })
  } catch (error) {
    console.error('Error in GET /api/chat/conversations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
        user = (await getUserFromCustomCookie(request)) ?? undefined
      }
      
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json()
    const { participant2_id } = body

    if (!participant2_id) {
      return NextResponse.json({ error: 'participant2_id is required' }, { status: 400 })
    }

    // Ensure participant1_id < participant2_id
    const participant1_id = user.id < participant2_id ? user.id : participant2_id
    const participant2_id_sorted = user.id < participant2_id ? participant2_id : user.id

    // Check if conversation already exists
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('participant1_id', participant1_id)
      .eq('participant2_id', participant2_id_sorted)
      .single()

    if (existingConv) {
      return NextResponse.json({ conversation: existingConv })
    }

    // Create new conversation
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        participant1_id,
        participant2_id: participant2_id_sorted,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating conversation:', error)
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
    }

    return NextResponse.json({ conversation })
  } catch (error) {
    console.error('Error in POST /api/chat/conversations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
