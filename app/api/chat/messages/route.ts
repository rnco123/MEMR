import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { generateSecureFileName, scanFileContent, validateFileUpload } from '@/lib/security/file-upload'
import { createSignedUrlMap } from '@/lib/storage/signed-url-map'
import { handleApiError } from '@/lib/api-error-handler'

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'
const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments'
const ATTACHMENTS_TABLE = 'chat_attachments'

const isMissingAttachmentsTableError = (err: unknown) => {
  const code = String((err as { code?: string } | null)?.code || '')
  const message = String((err as { message?: string } | null)?.message || '').toLowerCase()
  return code === 'PGRST205' || message.includes('chat_attachments')
}

async function ensureChatAttachmentsBucket() {
  const admin = createAdminClient()
  const { data: buckets, error: listErr } = await admin.storage.listBuckets()
  if (listErr) {
    console.error('Unable to list storage buckets:', listErr)
    return
  }

  const exists = (buckets || []).some((b) => b.name === CHAT_ATTACHMENTS_BUCKET || b.id === CHAT_ATTACHMENTS_BUCKET)
  if (exists) return

  const { error: createErr } = await admin.storage.createBucket(CHAT_ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  })

  if (createErr && !String(createErr.message || '').toLowerCase().includes('already exists')) {
    console.error('Unable to create chat attachments bucket:', createErr)
  }
}

export async function GET(request: NextRequest) {
  try {
    // M-04c: Use getUser() for verified auth.
    const supabase = await createClient()
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
      console.error('[chat/messages] fetch failed:', error)
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      )
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
      },
      attachments: [] as any[],
    })) || []

    // Ensure bucket exists (safe no-op if already present)
    await ensureChatAttachmentsBucket()

    // Fetch attachments for this conversation
    const { data: attachments, error: attachmentsErr } = await supabase
      .from(ATTACHMENTS_TABLE)
      .select('id, message_id, file_name, file_path, file_type, file_size, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (attachmentsErr && !isMissingAttachmentsTableError(attachmentsErr)) {
      console.error('Error fetching chat attachments:', attachmentsErr)
    }

    const admin = createAdminClient()
    const signedUrlByPath = await createSignedUrlMap(
      admin,
      CHAT_ATTACHMENTS_BUCKET,
      (attachments || []).map((item) => item.file_path),
      3600
    )
    const attachmentsByMessage = new Map<string, any[]>()
    for (const item of attachments || []) {
      const file_url = signedUrlByPath.get(item.file_path) ?? null
      const list = attachmentsByMessage.get(item.message_id) || []
      list.push({ ...item, file_url })
      attachmentsByMessage.set(item.message_id, list)
    }

    for (const msg of enrichedMessages) {
      msg.attachments = attachmentsByMessage.get(msg.id) || []
    }

    // Mark messages as read (only messages not sent by current user)
    const unreadMessages = enrichedMessages.filter(
      msg => msg.sender_id !== user.id && !msg.read_at
    )

    if (unreadMessages.length > 0) {
      const messageIds = unreadMessages.map(msg => msg.id)
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', messageIds)
    }

    return NextResponse.json({ messages: enrichedMessages })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    // M-04c: Use getUser() for verified auth.
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type') || ''
    let conversation_id = ''
    let content = ''
    const files: File[] = []

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      conversation_id = String(form.get('conversation_id') || '')
      content = String(form.get('content') || '')
      for (const fileItem of form.getAll('files')) {
        if (fileItem instanceof File && fileItem.size > 0) {
          files.push(fileItem)
        }
      }
    } else {
      const body = await request.json()
      conversation_id = String(body?.conversation_id || '')
      content = String(body?.content || '')
    }

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    }
    if (!content.trim() && files.length === 0) {
      return NextResponse.json({ error: 'message text or attachment is required' }, { status: 400 })
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
        content: content.trim() || (files.length > 0 ? '📎 Attachment' : ' '),
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

    const admin = createAdminClient()
    await ensureChatAttachmentsBucket()
    const messageAttachments: any[] = []

    if (files.length > 0) {
      for (const file of files) {
        const fileValidation = validateFileUpload(file)
        if (!fileValidation.valid) {
          return NextResponse.json({ error: fileValidation.error || 'Invalid file' }, { status: 400 })
        }

        const contentScan = await scanFileContent(file)
        if (!contentScan.valid) {
          return NextResponse.json({ error: contentScan.error || 'Invalid file content' }, { status: 400 })
        }

        const filePath = `${user.id}/${conversation_id}/${generateSecureFileName(file.name)}`
        const { error: uploadError } = await admin.storage
          .from(CHAT_ATTACHMENTS_BUCKET)
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          console.error('Error uploading chat attachment:', uploadError)
          return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 })
        }

        const { data: attachmentRow, error: attachmentErr } = await supabase
          .from(ATTACHMENTS_TABLE)
          .insert({
            message_id: message.id,
            conversation_id,
            uploaded_by: user.id,
            file_name: file.name,
            file_path: filePath,
            file_type: file.type,
            file_size: file.size,
          })
          .select('id, message_id, file_name, file_path, file_type, file_size, created_at')
          .single()

        if (attachmentErr || !attachmentRow) {
          console.error('Error saving chat attachment metadata:', attachmentErr)
          await supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).remove([filePath])
          if (isMissingAttachmentsTableError(attachmentErr)) {
            return NextResponse.json(
              {
                error:
                  "Attachment table is unavailable in this project. Please run migration '037_chat_attachments.sql' on the active Supabase project and retry.",
                code: 'CHAT_ATTACHMENTS_TABLE_MISSING',
              },
              { status: 500 }
            )
          }
          return NextResponse.json({ error: 'Failed to save attachment metadata' }, { status: 500 })
        }

        const { data: signed } = await admin.storage
          .from(CHAT_ATTACHMENTS_BUCKET)
          .createSignedUrl(filePath, 3600)
        messageAttachments.push({
          ...attachmentRow,
          file_url: signed?.signedUrl ?? null,
        })
      }
    }

    const enrichedMessage = {
      ...message,
      sender: {
        id: user.id,
        full_name: profile?.full_name || 'Unknown',
        role: profile?.role || 'unknown',
      },
      attachments: messageAttachments,
    }

    return NextResponse.json({ message: enrichedMessage })
  } catch (error) {
    return handleApiError(error)
  }
}
