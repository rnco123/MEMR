import { z } from 'zod'

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export const TICKET_SOURCES = ['floating_button', 'support_page'] as const

export type TicketStatus = (typeof TICKET_STATUSES)[number]
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]
export type TicketSource = (typeof TICKET_SOURCES)[number]

export const createTicketSchema = z.object({
  subject: z.string().min(3).max(200),
  content: z.string().min(1).max(4000),
  priority: z.enum(TICKET_PRIORITIES).default('normal'),
  source: z.enum(TICKET_SOURCES).default('support_page'),
  page_url: z.string().max(2048).optional(),
})

export const replySchema = z.object({
  content: z.string().min(1).max(4000),
})

export const updateTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
})

export const improveTextSchema = z.object({
  text: z.string().min(1).max(4000),
})

export interface TicketAttachment {
  id: string
  message_id: string
  ticket_id: string
  file_name: string
  file_path: string
  file_type: string
  file_size: number
  is_screenshot: boolean
  file_url: string | null
  created_at: string
}

export interface TicketMessage {
  id: string
  ticket_id: string
  sender_id: string
  sender_name: string | null
  sender_role: string | null
  content: string
  created_at: string
  attachments: TicketAttachment[]
}

export interface SupportTicket {
  id: string
  subject: string
  status: TicketStatus
  priority: TicketPriority
  source: TicketSource
  created_by: string | null
  created_by_name: string | null
  created_by_email: string | null
  created_by_role: string | null
  page_url: string | null
  device_type: string | null
  browser: string | null
  os: string | null
  user_agent: string | null
  assigned_to: string | null
  assigned_to_name: string | null
  last_message_at: string
  created_at: string
  updated_at: string
  messages?: TicketMessage[]
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export const STATUS_COLORS: Record<TicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-600',
}

export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}
