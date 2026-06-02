-- ============================================================
-- 056: Enforce 1:1 chat + enable Realtime for live messages
-- ============================================================

-- Prevent self-DM (participant1_id must be < participant2_id already)
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_different_participants;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_different_participants
  CHECK (participant1_id <> participant2_id);

COMMENT ON TABLE public.conversations IS
  'One direct (1:1) conversation per pair of staff users; participant1_id < participant2_id.';

-- Realtime: live message delivery in Chat UI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;
