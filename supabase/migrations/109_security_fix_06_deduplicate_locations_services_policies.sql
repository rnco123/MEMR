-- Captured from live database into git for record-keeping.
-- Original applied version: 20260628145840 (2026-06-28) — already applied to STAGING + PRODUCTION.
-- Part of the June 2026 Supabase security-linter remediation batch (fixes 01-10).

-- ============================================================
-- SECURITY FIX 06: Remove duplicate RLS policies
-- locations and services each had two identical SELECT policies.
-- Keep one canonical policy per table; drop the redundant copy.
-- ============================================================

-- locations: drop the redundant duplicate
DROP POLICY IF EXISTS "Public read locations" ON public.locations;
-- "locations_read_public" remains as the canonical policy

-- services: drop the redundant duplicate
DROP POLICY IF EXISTS "Public read services" ON public.services;
-- "services_read_public" remains as the canonical policy
