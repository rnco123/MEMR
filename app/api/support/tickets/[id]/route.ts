import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { updateTicketSchema } from '@/lib/support/types'
import {
  SUPPORT_TICKET_SELECT,
  SUPPORT_TICKET_OWNERSHIP_SELECT,
  SUPPORT_TICKET_MESSAGE_SELECT,
  SUPPORT_TICKET_ATTACHMENT_SELECT,
} from '@/lib/support/support-selects'
import { resolveSupportActor } from '@/lib/support/resolve-actor'
import { createSignedUrlMap } from '@/lib/storage/signed-url-map'
import { handleApiError } from '@/lib/api-error-handler'

export const dynamic = 'force-dynamic'

const BUCKET = 'support-attachments'

type Params = { params: { id: string } }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const profile = await resolveSupportActor(supabase, user.id)
    const isAdmin = profile?.role === 'admin'

    const adminClient = createAdminClient()

    // Fetch ticket
    const { data: ticket, error: ticketErr } = await adminClient
      .from('support_tickets')
      .select(SUPPORT_TICKET_SELECT)
      .eq('id', params.id)
      .single()

    if (ticketErr || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Authorization
    if (!isAdmin && ticket.created_by !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Fetch messages
    const { data: messages } = await adminClient
      .from('support_ticket_messages')
      .select(SUPPORT_TICKET_MESSAGE_SELECT)
      .eq('ticket_id', params.id)
      .order('created_at', { ascending: true })

    // Fetch attachments and generate signed URLs (batched, one storage round trip)
    const { data: attachments } = await adminClient
      .from('support_ticket_attachments')
      .select(SUPPORT_TICKET_ATTACHMENT_SELECT)
      .eq('ticket_id', params.id)
      .order('created_at', { ascending: true })

    const signedUrlByPath = await createSignedUrlMap(
      adminClient,
      BUCKET,
      (attachments || []).map((att) => att.file_path),
      3600
    )

    const attachmentsByMessage = new Map<string, any[]>()
    for (const att of attachments || []) {
      const withUrl = { ...att, file_url: signedUrlByPath.get(att.file_path) ?? null }
      const list = attachmentsByMessage.get(att.message_id) || []
      list.push(withUrl)
      attachmentsByMessage.set(att.message_id, list)
    }

    const enrichedMessages = (messages || []).map((msg) => ({
      ...msg,
      attachments: attachmentsByMessage.get(msg.id) || [],
    }))

    return NextResponse.json({ ticket: { ...ticket, messages: enrichedMessages } })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const profile = await resolveSupportActor(supabase, user.id)
    const isAdmin = profile?.role === 'admin'

    const body = await request.json()
    const parsed = updateTicketSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Fetch ticket to check ownership / current status
    const { data: ticket, error: fetchErr } = await adminClient
      .from('support_tickets')
      .select(SUPPORT_TICKET_OWNERSHIP_SELECT)
      .eq('id', params.id)
      .single()

    if (fetchErr || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const updates: Record<string, any> = {}

    if (isAdmin) {
      // Admin can set status, priority, and assignment
      if (parsed.data.status !== undefined) updates.status = parsed.data.status
      if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority
      if (parsed.data.assigned_to !== undefined) updates.assigned_to = parsed.data.assigned_to
    } else {
      // Non-admin creator can only close a resolved ticket (verification step)
      if (ticket.created_by !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }
      if (parsed.data.status === 'closed' && ticket.status === 'resolved') {
        updates.status = 'closed'
      } else if (parsed.data.status === 'in_progress' && ticket.status === 'resolved') {
        // User disputes resolution — reopen
        updates.status = 'in_progress'
      } else {
        return NextResponse.json({ error: 'Only admins can change ticket status' }, { status: 403 })
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ticket }, { status: 200 })
    }

    const { data: updated, error: updateErr } = await adminClient
      .from('support_tickets')
      .update(updates)
      .eq('id', params.id)
      .select(SUPPORT_TICKET_SELECT)
      .single()

    if (updateErr) {
      console.error('[PATCH /api/support/tickets/[id]]', updateErr)
      return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 })
    }

    return NextResponse.json({ ticket: updated })
  } catch (err) {
    return handleApiError(err)
  }
}
