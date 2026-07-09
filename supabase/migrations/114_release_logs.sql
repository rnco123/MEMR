-- Release logs: admin-facing "What's New" / "Upcoming" board.
-- Only raheel@myclinicmd.com may create/edit/release entries (enforced in API layer via
-- lib/release-logs/auth.ts); all admins may read. Writes go through the service-role
-- client in app/api/admin/release-logs, so no client-side write policies are needed.

CREATE TABLE IF NOT EXISTS public.release_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'released')),
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.release_logs IS
  'Product release log entries (What''s New / Upcoming tabs) managed by a single fixed admin owner.';

CREATE INDEX IF NOT EXISTS idx_release_logs_status_sort ON public.release_logs(status, sort_order, created_at DESC);

ALTER TABLE public.release_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all release log entries. All writes happen through the
-- service-role admin API, so no INSERT/UPDATE/DELETE policies are defined.
DROP POLICY IF EXISTS "Admins can view release logs" ON public.release_logs;
CREATE POLICY "Admins can view release logs"
  ON public.release_logs
  FOR SELECT
  USING (public.is_admin_user());

CREATE OR REPLACE FUNCTION public.update_release_logs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_logs_updated_at ON public.release_logs;
CREATE TRIGGER trg_release_logs_updated_at
  BEFORE UPDATE ON public.release_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_release_logs_updated_at();
