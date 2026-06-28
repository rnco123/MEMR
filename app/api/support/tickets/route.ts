import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { generateSecureFileName, scanFileContent, validateFileUpload } from '@/lib/security/file-upload'
import { parseDeviceInfo } from '@/lib/support/device'
import { createTicketSchema } from '@/lib/support/types'
import { SUPPORT_TICKET_SELECT } from '@/lib/support/support-selects'
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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Resolve role
    const profile = await resolveSupportActor(supabase, user.id)
    const isAdmin = profile?.role === 'admin'

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')

    const admin = createAdminClient()
    let query = admin
      .from('support_tickets')
      .select(SUPPORT_TICKET_SELECT)
      .order('created_at', { ascending: false })

    if (!isAdmin) {
      query = query.eq('created_by', user.id)
    }
    if (status) query = query.eq('status', status)
    if (priority) query = query.eq('priority', priority)

    const { data: tickets, error } = await query
    if (error) {
      console.error('[GET /api/support/tickets]', error)
      return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 })
    }

    return NextResponse.json({ tickets: tickets || [] })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Parse multipart or JSON
    const contentType = request.headers.get('content-type') || ''
    let fields: Record<string, string> = {}
    const files: File[] = []

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      for (const [key, val] of form.entries()) {
        if (val instanceof File && val.size > 0) {
          files.push(val)
        } else if (typeof val === 'string') {
          fields[key] = val
        }
      }
    } else {
      fields = await request.json()
    }

    const parsed = createTicketSchema.safeParse({
      subject: fields.subject,
      content: fields.content,
      priority: fields.priority || 'normal',
      source: fields.source || 'support_page',
      page_url: fields.page_url,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }
    const { subject, content, priority, source, page_url } = parsed.data

    // Get user profile for snapshot
    const profile = await resolveSupportActor(supabase, user.id)

    // Device info from User-Agent
    const ua = request.headers.get('user-agent') || ''
    const deviceInfo = parseDeviceInfo(ua)

    const adminClient = createAdminClient()

    // Create the ticket
    const { data: ticket, error: ticketErr } = await adminClient
      .from('support_tickets')
      .insert({
        subject,
        priority,
        source,
        created_by: user.id,
        created_by_name: profile?.full_name || null,
        created_by_email: profile?.email || user.email || null,
        created_by_role: profile?.role || null,
        page_url: page_url || null,
        ...deviceInfo,
        user_agent: ua.substring(0, 500),
      })
      .select()
      .single()

    if (ticketErr || !ticket) {
      console.error('[POST /api/support/tickets] ticket insert:', ticketErr)
      return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
    }

    // Create the first message
    const { data: message, error: msgErr } = await adminClient
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_name: profile?.full_name || null,
        sender_role: profile?.role || null,
        content,
      })
      .select()
      .single()

    if (msgErr || !message) {
      console.error('[POST /api/support/tickets] message insert:', msgErr)
      return NextResponse.json({ error: 'Failed to create initial message' }, { status: 500 })
    }

    // Handle file attachments (screenshots or images)
    if (files.length > 0) {
      await ensureBucket()

      for (const file of files) {
        const validation = validateFileUpload(file)
        if (!validation.valid) continue

        const scan = await scanFileContent(file)
        if (!scan.valid) continue

        const isScreenshot = file.name.startsWith('screenshot')
        const filePath = `${user.id}/${ticket.id}/${generateSecureFileName(file.name)}`

        const { error: uploadErr } = await adminClient.storage
          .from(BUCKET)
          .upload(filePath, file, { cacheControl: '3600', upsert: false })

        if (uploadErr) {
          console.error('[POST /api/support/tickets] upload:', uploadErr)
          continue
        }

        await adminClient.from('support_ticket_attachments').insert({
          message_id: message.id,
          ticket_id: ticket.id,
          uploaded_by: user.id,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size,
          is_screenshot: isScreenshot,
        })
      }
    }

    return NextResponse.json({ ticket, message }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
