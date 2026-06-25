-- ============================================
-- SUPPORT TICKETS SYSTEM
-- ============================================
-- Tables: support_tickets, support_ticket_messages, support_ticket_attachments
-- Storage bucket: support-attachments (private)
-- RLS: creators see own tickets; admins see all
-- Realtime: enabled on messages for live chat
-- ============================================

-- 1) Storage bucket (private, images + PDFs up to 10MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) Main tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  source TEXT NOT NULL DEFAULT 'support_page'
    CHECK (source IN ('floating_button', 'support_page')),
  -- Reporter snapshot (denormalized, matches audit_logs convention)
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_by_email TEXT,
  created_by_role TEXT,
  -- Device / context captured at creation
  page_url TEXT,
  device_type TEXT,   -- 'mobile' | 'tablet' | 'desktop'
  browser TEXT,
  os TEXT,
  user_agent TEXT,
  -- Admin assignment
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  -- Timestamps
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by ON public.support_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Creators can read their own tickets
DROP POLICY IF EXISTS "Users can view own tickets" ON public.support_tickets;
CREATE POLICY "Users can view own tickets"
  ON public.support_tickets FOR SELECT
  USING (created_by = auth.uid());

-- Admins can view all tickets
DROP POLICY IF EXISTS "Admins can view all tickets" ON public.support_tickets;
CREATE POLICY "Admins can view all tickets"
  ON public.support_tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (uid = auth.uid() OR id = auth.uid())
        AND role = 'admin'
    )
  );

-- Authenticated users can create tickets
DROP POLICY IF EXISTS "Authenticated users can create tickets" ON public.support_tickets;
CREATE POLICY "Authenticated users can create tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Admins can update any ticket (status, priority, assignment)
DROP POLICY IF EXISTS "Admins can update tickets" ON public.support_tickets;
CREATE POLICY "Admins can update tickets"
  ON public.support_tickets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (uid = auth.uid() OR id = auth.uid())
        AND role = 'admin'
    )
  );

-- Creators can update their own ticket (e.g. close after resolved)
DROP POLICY IF EXISTS "Creators can update own tickets" ON public.support_tickets;
CREATE POLICY "Creators can update own tickets"
  ON public.support_tickets FOR UPDATE
  USING (created_by = auth.uid());

-- 3) Ticket messages (threaded chat)
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name TEXT,
  sender_role TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_st_messages_ticket_id ON public.support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_st_messages_created_at ON public.support_ticket_messages(created_at ASC);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Ticket creator can read messages on their own tickets
DROP POLICY IF EXISTS "Users can view messages on own tickets" ON public.support_ticket_messages;
CREATE POLICY "Users can view messages on own tickets"
  ON public.support_ticket_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND t.created_by = auth.uid()
    )
  );

-- Admins can view all messages
DROP POLICY IF EXISTS "Admins can view all messages" ON public.support_ticket_messages;
CREATE POLICY "Admins can view all messages"
  ON public.support_ticket_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (uid = auth.uid() OR id = auth.uid())
        AND role = 'admin'
    )
  );

-- Ticket creator can insert messages on their own tickets
DROP POLICY IF EXISTS "Users can send messages on own tickets" ON public.support_ticket_messages;
CREATE POLICY "Users can send messages on own tickets"
  ON public.support_ticket_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND t.created_by = auth.uid()
    )
  );

-- Admins can insert messages on any ticket
DROP POLICY IF EXISTS "Admins can reply to any ticket" ON public.support_ticket_messages;
CREATE POLICY "Admins can reply to any ticket"
  ON public.support_ticket_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (uid = auth.uid() OR id = auth.uid())
        AND role = 'admin'
    )
  );

-- 4) Ticket attachments (mirrors chat_attachments)
CREATE TABLE IF NOT EXISTS public.support_ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.support_ticket_messages(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  is_screenshot BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_st_attachments_message_id ON public.support_ticket_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_st_attachments_ticket_id ON public.support_ticket_attachments(ticket_id);

ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;

-- Users can view attachments on their own tickets
DROP POLICY IF EXISTS "Users can view attachments on own tickets" ON public.support_ticket_attachments;
CREATE POLICY "Users can view attachments on own tickets"
  ON public.support_ticket_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_attachments.ticket_id
        AND t.created_by = auth.uid()
    )
  );

-- Admins can view all attachments
DROP POLICY IF EXISTS "Admins can view all attachments" ON public.support_ticket_attachments;
CREATE POLICY "Admins can view all attachments"
  ON public.support_ticket_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (uid = auth.uid() OR id = auth.uid())
        AND role = 'admin'
    )
  );

-- Uploaders can insert their own attachments
DROP POLICY IF EXISTS "Users can upload attachments to own tickets" ON public.support_ticket_attachments;
CREATE POLICY "Users can upload attachments to own tickets"
  ON public.support_ticket_attachments FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_attachments.ticket_id
        AND t.created_by = auth.uid()
    )
  );

-- Admins can upload attachments to any ticket
DROP POLICY IF EXISTS "Admins can upload attachments to any ticket" ON public.support_ticket_attachments;
CREATE POLICY "Admins can upload attachments to any ticket"
  ON public.support_ticket_attachments FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (uid = auth.uid() OR id = auth.uid())
        AND role = 'admin'
    )
  );

-- 5) Storage policies for support-attachments bucket
DROP POLICY IF EXISTS "Support ticket participants can view attachments" ON storage.objects;
CREATE POLICY "Support ticket participants can view attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (
      -- uploader always sees their own
      split_part(name, '/', 1) = auth.uid()::text
      -- admin sees all
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE (uid = auth.uid() OR id = auth.uid())
          AND role = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can upload support attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload support attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Uploaders can delete own support attachments" ON storage.objects;
CREATE POLICY "Uploaders can delete own support attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- 6) updated_at trigger on support_tickets
CREATE OR REPLACE FUNCTION update_support_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_ticket_updated_at();

-- 7) Touch last_message_at on ticket when a new message is inserted
CREATE OR REPLACE FUNCTION touch_ticket_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.support_tickets
  SET last_message_at = NOW(), updated_at = NOW()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_ticket_last_message ON public.support_ticket_messages;
CREATE TRIGGER trg_touch_ticket_last_message
  AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION touch_ticket_last_message_at();

-- 8) Enable Realtime on messages (live chat thread updates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'support_ticket_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
  END IF;
END $$;

-- Also realtime on ticket status changes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;
END $$;
