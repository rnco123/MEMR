-- Tracks when each admin last viewed the Release Logs page, so the sidebar can show a
-- "new activity" dot for anyone (other than the fixed release logs manager) who hasn't
-- seen the latest What's New / Upcoming changes yet.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS release_logs_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.release_logs_seen_at IS
  'Last time this user opened /admin/release-logs. Compared against release_logs.updated_at to show an unread indicator.';
