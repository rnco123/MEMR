import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { generateSecureFileName, scanFileContent, validateFileUpload } from '@/lib/security/file-upload'
import { replySchema } from '@/lib/support/types'
import { resolveSupportActor } from '@/lib/support/resolve-actor'
import { handleApiError } from '@/lib/api-error-handler'

export const dynamic = 'force-dynamic'

const BUCKET = 'support-attachments'

async function ensureBucket() {
  const admin = createAdminClient()
  const { data: buckets } = await admin.storage.listBuckets()
  if ((buckets || []).some((b) => b.id === BUCKET)) return
  await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'application/pdf'],
  })
}

type Params = { params: { id: string } }

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const profile = await resolveSupportActor(supabase, user.id)
    const isAdmin = profile?.role === 'admin'

    const adminClient = createAdminClient()

    // Verify ticket access
    const { data: ticket, error: ticketErr } = await adminClient
      .from('support_tickets')
      .select('id, created_by, status')
      .eq('id', params.id)
      .single()

    if (ticketErr || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (!isAdmin && ticket.created_by !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (ticket.status === 'closed') {
      return NextResponse.json({ error: 'Cannot reply to a closed ticket' }, { status: 400 })
    }

    // Parse form or JSON
    const contentType = request.headers.get('content-type') || ''
    let content = ''
    const files: File[] = []

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      content = String(form.get('content') || '')
      for (const fileItem of form.getAll('files')) {
        if (fileItem instanceof File && fileItem.size > 0) files.push(fileItem)
      }
    } else {
      const body = await request.json()
      content = String(body?.content || '')
    }

    const parsed = replySchema.safeParse({ content })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    // Insert message
    const { data: message, error: msgErr } = await adminClient
      .from('support_ticket_messages')
      .insert({
        ticket_id: params.id,
        sender_id: user.id,
        sender_name: profile?.full_name || null,
        sender_role: profile?.role || null,
        content: parsed.data.content,
      })
      .select()
      .single()

    if (msgErr || !message) {
      console.error('[POST messages]', msgErr)
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }

    const messageAttachments: any[] = []

    // Handle files
    if (files.length > 0) {
      await ensureBucket()

      for (const file of files) {
        const validation = validateFileUpload(file)
        if (!validation.valid) continue

        const scan = await scanFileContent(file)
        if (!scan.valid) continue

        const filePath = `${user.id}/${params.id}/${generateSecureFileName(file.name)}`
        const { error: uploadErr } = await adminClient.storage
          .from(BUCKET)
          .upload(filePath, file, { cacheControl: '3600', upsert: false })

        if (uploadErr) {
          console.error('[POST messages] upload:', uploadErr)
          continue
        }

        const { data: attRow } = await adminClient
          .from('support_ticket_attachments')
          .insert({
            message_id: message.id,
            ticket_id: params.id,
            uploaded_by: user.id,
            file_name: file.name,
            file_path: filePath,
            file_type: file.type,
            file_size: file.size,
            is_screenshot: false,
          })
          .select()
          .single()

        if (attRow) {
          const { data: signed } = await adminClient.storage
            .from(BUCKET)
            .createSignedUrl(filePath, 3600)
          messageAttachments.push({ ...attRow, file_url: signed?.signedUrl ?? null })
        }
      }
    }

    // If admin replies to an open ticket, auto-advance to in_progress
    if (isAdmin && ticket.status === 'open') {
      await adminClient
        .from('support_tickets')
        .update({ status: 'in_progress' })
        .eq('id', params.id)
    }

    return NextResponse.json({ message: { ...message, attachments: messageAttachments } }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
