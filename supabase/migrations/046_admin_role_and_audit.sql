-- ============================================================
-- 046: Admin role support + enriched audit_logs
-- ============================================================

-- 1. Allow 'admin' as a valid role in profiles
-- Supabase stores role as TEXT with no DB-level enum, so just
-- ensure the column exists (it does from migration 006).
-- We document the valid values in a comment:
COMMENT ON COLUMN public.profiles.role IS
  'Valid values: doctor | nurse | staff | admin';

-- 2. Enrich audit_logs with snapshot columns so the admin UI
--    can display user info without joining auth.users each time.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS user_name  TEXT,
  ADD COLUMN IF NOT EXISTS user_role  TEXT,
  ADD COLUMN IF NOT EXISTS page_url   TEXT;

-- Index for filtering by role
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_role
  ON public.audit_logs(user_role);

-- 3. RLS: admin can see ALL audit logs (policy already drafted in 018, just idempotent)
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- 4. Admin can also delete stale logs (useful for HIPAA retention management)
DROP POLICY IF EXISTS "Admins can delete audit logs" ON public.audit_logs;
CREATE POLICY "Admins can delete audit logs"
  ON public.audit_logs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- 5. A view that the admin API will use (service role bypasses RLS anyway,
--    but handy for Supabase SQL editor queries)
CREATE OR REPLACE VIEW public.audit_logs_with_user AS
SELECT
  al.*,
  p.full_name  AS profile_name,
  p.email      AS profile_email,
  p.role       AS profile_role
FROM public.audit_logs al
LEFT JOIN public.profiles p ON p.uid = al.user_id;
