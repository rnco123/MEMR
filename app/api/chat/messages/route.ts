import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')

    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    }

    // Verify user is part of this conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id, participant1_id, participant2_id')
      .eq('id', conversationId)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    if (conversation.participant1_id !== user.id && conversation.participant2_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Fetch messages
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, read_at, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching messages:', error)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    // Mark messages as read (only messages not sent by current user)
    const unreadMessages = messages?.filter(
      msg => msg.sender_id !== user.id && !msg.read_at
    ) || []

    if (unreadMessages.length > 0) {
      const messageIds = unreadMessages.map(msg => msg.id)
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', messageIds)
    }

    // Fetch sender profiles
    const senderIds = [...new Set(messages?.map(msg => msg.sender_id) || [])]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('uid, full_name, role')
      .in('uid', senderIds)

    const profilesMap = new Map(profiles?.map(p => [p.uid, p]) || [])

    // Enrich messages with sender info
    const enrichedMessages = messages?.map(msg => ({
      ...msg,
      sender: {
        id: msg.sender_id,
        full_name: profilesMap.get(msg.sender_id)?.full_name || 'Unknown',
        role: profilesMap.get(msg.sender_id)?.role || 'unknown',
      }
    }))

    return NextResponse.json({ messages: enrichedMessages || [] })
  } catch (error) {
    console.error('Error in GET /api/chat/messages:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { conversation_id, content } = body

    if (!conversation_id || !content) {
      return NextResponse.json({ error: 'conversation_id and content are required' }, { status: 400 })
    }

    // Verify user is part of this conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id, participant1_id, participant2_id')
      .eq('id', conversation_id)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    if (conversation.participant1_id !== user.id && conversation.participant2_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Create message
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        sender_id: user.id,
        content: content.trim(),
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating message:', error)
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }

    // Fetch sender profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, full_name, role')
      .eq('uid', user.id)
      .single()

    const enrichedMessage = {
      ...message,
      sender: {
        id: user.id,
        full_name: profile?.full_name || 'Unknown',
        role: profile?.role || 'unknown',
      }
    }

    return NextResponse.json({ message: enrichedMessage })
  } catch (error) {
    console.error('Error in POST /api/chat/messages:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
