-- Captured from live database into git for record-keeping.
-- Original applied version: 20260628150419 (2026-06-28) — already applied to STAGING + PRODUCTION.
-- Part of the June 2026 Supabase security-linter remediation batch (fixes 01-10).

-- ============================================================
-- SECURITY FIX 10: Prevent directory listing on staff-avatars.
-- The public bucket doesn't need a storage.objects SELECT policy
-- for direct URL access — that's handled by the public flag.
-- The SELECT policy only enables listing, which we don't want.
-- Drop it; direct object URLs will still work via public CDN.
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view staff avatars" ON storage.objects;
