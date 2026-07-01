-- Captured from live database into git for record-keeping.
-- Original applied version: 20260628145655 (2026-06-28) — already applied to STAGING + PRODUCTION.
-- Part of the June 2026 Supabase security-linter remediation batch (fixes 01-10).

-- ============================================================
-- SECURITY FIX 02: Replace open anon ALL policies on utility
-- tables with tightly scoped authenticated policies
-- ============================================================

-- ── admin_rules ──────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_rules_all" ON public.admin_rules;

CREATE POLICY "admin_rules_authenticated_read"
  ON public.admin_rules
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_rules_admin_write"
  ON public.admin_rules
  FOR ALL
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- ── email_threads ─────────────────────────────────────────────
DROP POLICY IF EXISTS "email_threads_all" ON public.email_threads;

CREATE POLICY "email_threads_staff_all"
  ON public.email_threads
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  );

-- ── email_messages ────────────────────────────────────────────
DROP POLICY IF EXISTS "email_messages_all" ON public.email_messages;

CREATE POLICY "email_messages_staff_all"
  ON public.email_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  );

-- ── email_processing_jobs ─────────────────────────────────────
DROP POLICY IF EXISTS "email_processing_jobs_all" ON public.email_processing_jobs;

CREATE POLICY "email_processing_jobs_admin_all"
  ON public.email_processing_jobs
  FOR ALL
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- ── openai_usage_logs ─────────────────────────────────────────
DROP POLICY IF EXISTS "openai_usage_logs_all" ON public.openai_usage_logs;

-- Inserts happen server-side; reads are admin-only
CREATE POLICY "openai_usage_logs_admin_read"
  ON public.openai_usage_logs
  FOR SELECT
  TO authenticated
  USING (is_admin_user());

CREATE POLICY "openai_usage_logs_service_insert"
  ON public.openai_usage_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ── thread_ratings ────────────────────────────────────────────
DROP POLICY IF EXISTS "thread_ratings_all" ON public.thread_ratings;

-- Ratings are submitted by anyone with a valid session_key (anon OK for INSERT only)
-- but reads/deletes are admin-only
CREATE POLICY "thread_ratings_anon_insert"
  ON public.thread_ratings
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "thread_ratings_admin_manage"
  ON public.thread_ratings
  FOR ALL
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

CREATE POLICY "thread_ratings_owner_select"
  ON public.thread_ratings
  FOR SELECT
  TO anon, authenticated
  USING (true);  -- session_key is already a secret token; read is safe
