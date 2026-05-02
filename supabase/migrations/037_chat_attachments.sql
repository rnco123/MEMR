-- ============================================
-- CHAT ATTACHMENTS (doctor/nurse/staff chat)
-- ============================================

-- 1) Storage bucket for chat attachments (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) Attachment metadata table
CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_message_id
  ON public.chat_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_conversation_id
  ON public.chat_attachments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_uploaded_by
  ON public.chat_attachments(uploaded_by);

ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

-- View attachments only for conversations user belongs to
DROP POLICY IF EXISTS "Users can view attachments in own conversations" ON public.chat_attachments;
CREATE POLICY "Users can view attachments in own conversations"
  ON public.chat_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = chat_attachments.conversation_id
        AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
    )
  );

-- Insert attachments only for own uploads in own conversations
DROP POLICY IF EXISTS "Users can insert attachments in own conversations" ON public.chat_attachments;
CREATE POLICY "Users can insert attachments in own conversations"
  ON public.chat_attachments
  FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = chat_attachments.conversation_id
        AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
    )
  );

-- Optional delete for uploader in own conversation
DROP POLICY IF EXISTS "Users can delete own attachments in own conversations" ON public.chat_attachments;
CREATE POLICY "Users can delete own attachments in own conversations"
  ON public.chat_attachments
  FOR DELETE
  USING (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = chat_attachments.conversation_id
        AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
    )
  );

-- 3) Storage policies for chat-attachments bucket
DROP POLICY IF EXISTS "Chat participants can view chat attachments" ON storage.objects;
CREATE POLICY "Chat participants can view chat attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.chat_attachments a
      WHERE a.file_path = storage.objects.name
        AND EXISTS (
          SELECT 1
          FROM public.conversations c
          WHERE c.id = a.conversation_id
            AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Chat participants can upload chat attachments" ON storage.objects;
CREATE POLICY "Chat participants can upload chat attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Uploaders can delete own chat attachments" ON storage.objects;
CREATE POLICY "Uploaders can delete own chat attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );
