import { getChatSupabaseClient, resolveChatUser, sortParticipantIds } from '@/lib/chat/auth'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function enrichConversation(
  supabase: Awaited<ReturnType<typeof getChatSupabaseClient>>,
  conv: {
    id: string
    participant1_id: string
    participant2_id: string
    last_message_at?: string | null
    created_at?: string | null
    updated_at?: string | null
  },
  currentUserId: string
) {
  const otherParticipantId =
    conv.participant1_id === currentUserId ? conv.participant2_id : conv.participant1_id

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, full_name, role, email')
    .eq('uid', otherParticipantId)
    .maybeSingle()

  return {
    ...conv,
    other_participant: {
      id: otherParticipantId,
      full_name: profile?.full_name || 'Unknown',
      role: profile?.role || 'unknown',
      email: profile?.email || null,
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await resolveChatUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await getChatSupabaseClient(request)

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
    const user = await resolveChatUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await getChatSupabaseClient(request)
    const body = await request.json()
    const otherUserId = String(body?.participant2_id || '').trim()

    if (!otherUserId) {
      return NextResponse.json({ error: 'participant2_id is required' }, { status: 400 })
    }

    if (otherUserId === user.id) {
      return NextResponse.json({ error: 'Cannot start a chat with yourself' }, { status: 400 })
    }

    const [participant1_id, participant2_id_sorted] = sortParticipantIds(user.id, otherUserId)

    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, participant1_id, participant2_id, last_message_at, created_at, updated_at')
      .eq('participant1_id', participant1_id)
      .eq('participant2_id', participant2_id_sorted)
      .maybeSingle()

    if (existingConv) {
      const enriched = await enrichConversation(supabase, existingConv, user.id)
      return NextResponse.json({ conversation: enriched })
    }

    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        participant1_id,
        participant2_id: participant2_id_sorted,
      })
      .select('id, participant1_id, participant2_id, last_message_at, created_at, updated_at')
      .single()

    if (error) {
      console.error('Error creating conversation:', error)
      if (error.code === '23505') {
        const { data: retry } = await supabase
          .from('conversations')
          .select('id, participant1_id, participant2_id, last_message_at, created_at, updated_at')
          .eq('participant1_id', participant1_id)
          .eq('participant2_id', participant2_id_sorted)
          .maybeSingle()
        if (retry) {
          const enriched = await enrichConversation(supabase, retry, user.id)
          return NextResponse.json({ conversation: enriched })
        }
      }
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
    }

    const enriched = await enrichConversation(supabase, conversation, user.id)
    return NextResponse.json({ conversation: enriched })
  } catch (error) {
    console.error('Error in POST /api/chat/conversations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
