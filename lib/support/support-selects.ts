/** Explicit column lists for support ticket API (no select('*')). Mirrors SupportTicket/TicketMessage/TicketAttachment in lib/support/types.ts. */

export const SUPPORT_TICKET_SELECT =
  'id, subject, status, priority, source, created_by, created_by_name, created_by_email, created_by_role, page_url, device_type, browser, os, user_agent, assigned_to, assigned_to_name, last_message_at, created_at, updated_at'

export const SUPPORT_TICKET_OWNERSHIP_SELECT = 'id, created_by, status'

export const SUPPORT_TICKET_MESSAGE_SELECT =
  'id, ticket_id, sender_id, sender_name, sender_role, content, created_at'

export const SUPPORT_TICKET_ATTACHMENT_SELECT =
  'id, message_id, ticket_id, file_name, file_path, file_type, file_size, is_screenshot, created_at'
