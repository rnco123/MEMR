-- Captured from live database into git for record-keeping.
-- Original applied version: 20260628150350 (2026-06-28) — already applied to STAGING + PRODUCTION.
-- Part of the June 2026 Supabase security-linter remediation batch (fixes 01-10).

-- ============================================================
-- SECURITY FIX 08: Revoke public EXECUTE on SECURITY DEFINER
-- functions that should never be called directly via the API.
--
-- cleanup_old_audit_logs  → internal maintenance only
-- handle_new_user_profile → auth trigger only
-- rls_auto_enable         → DDL event trigger only
--
-- is_admin_user is used in RLS policies (called internally by
-- Postgres during row evaluation, not via REST API). We revoke
-- anon EXECUTE but keep authenticated since RLS evaluation
-- happens in the context of the calling role. However, direct
-- API invocation by any role is not needed, so we revoke both
-- anon and authenticated direct-call grants and keep only the
-- implicit execution via RLS.
-- ============================================================

-- Revoke all direct execution from anon and authenticated
REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, PUBLIC;

-- is_admin_user: revoke anon (it should never be publicly callable)
-- Keep postgres/service_role for internal RLS evaluation
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon, PUBLIC;

-- Grant back to authenticated so RLS policies that call is_admin_user() continue to work
-- (RLS evaluation runs in the context of the querying role)
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
