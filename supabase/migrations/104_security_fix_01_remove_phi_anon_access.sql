-- Captured from live database into git for record-keeping.
-- Original applied version: 20260628145602 (2026-06-28) — already applied to STAGING + PRODUCTION.
-- Part of the June 2026 Supabase security-linter remediation batch (fixes 01-10).

-- ============================================================
-- SECURITY FIX 01: Remove unauthenticated access to PHI tables
-- Affected: patients, encounters, intake_form, ai_soapnotes
-- These policies exposed protected health information (PHI) to
-- any unauthenticated HTTP request using the public anon key.
-- Authenticated clinical staff policies remain intact.
-- ============================================================

-- patients: two anon SELECT policies
DROP POLICY IF EXISTS "patients_read_for_automation" ON public.patients;
DROP POLICY IF EXISTS "public read patients"          ON public.patients;

-- encounters: two anon SELECT + one anon INSERT policy
DROP POLICY IF EXISTS "Allow SELECT for anon/auth"   ON public.encounters;
DROP POLICY IF EXISTS "encounters_read_automation"   ON public.encounters;
DROP POLICY IF EXISTS "Public insert encounters"     ON public.encounters;

-- intake_form: anon SELECT + anon INSERT
DROP POLICY IF EXISTS "Allow anon select"            ON public.intake_form;
DROP POLICY IF EXISTS "Allow anon insert"            ON public.intake_form;

-- ai_soapnotes: anon SELECT
DROP POLICY IF EXISTS "ai_soapnotes_read_automation" ON public.ai_soapnotes;

-- Replace with authenticated-only equivalents where the anon INSERT was legitimate
-- (intake_form INSERT was used by public-facing intake flow — restrict to authenticated only)
CREATE POLICY "intake_form_authenticated_insert"
  ON public.intake_form
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "intake_form_authenticated_select"
  ON public.intake_form
  FOR SELECT
  TO authenticated
  USING (true);
