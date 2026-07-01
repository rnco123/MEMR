-- Captured from live database into git for record-keeping.
-- Original applied version: 20260628150406 (2026-06-28) — already applied to STAGING + PRODUCTION.
-- Part of the June 2026 Supabase security-linter remediation batch (fixes 01-10).

-- ============================================================
-- SECURITY FIX 09: Tighten WITH CHECK (true) INSERT policies
-- flagged by Supabase linter as overly permissive.
-- ============================================================

-- ── forms ─────────────────────────────────────────────────────
-- "Allow anon insert" was open to anon with no check.
-- Forms are created server-side only — remove anon insert,
-- keep the existing service_role and admin policies.
DROP POLICY IF EXISTS "Allow anon insert" ON public.forms;
-- forms_insert_service (service_role) and forms_admin_all already exist and are correct.

-- ── intake_form ────────────────────────────────────────────────
-- Tighten the authenticated insert we created in migration 01.
-- Require that appointment_id is present (intake must reference an appointment).
DROP POLICY IF EXISTS "intake_form_authenticated_insert" ON public.intake_form;

CREATE POLICY "intake_form_authenticated_insert"
  ON public.intake_form
  FOR INSERT
  TO authenticated
  WITH CHECK (appointment_id IS NOT NULL);

-- ── thread_ratings ─────────────────────────────────────────────
-- Tighten: require session_key to be non-null on insert
-- (ratings are always tied to a unique session token).
DROP POLICY IF EXISTS "thread_ratings_anon_insert" ON public.thread_ratings;

CREATE POLICY "thread_ratings_anon_insert"
  ON public.thread_ratings
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (session_key IS NOT NULL);
