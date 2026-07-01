-- Captured from live database into git for record-keeping.
-- Original applied version: 20260628145805 (2026-06-28) — already applied to STAGING + PRODUCTION.
-- Part of the June 2026 Supabase security-linter remediation batch (fixes 01-10).

-- ============================================================
-- SECURITY FIX 04: Pin search_path on SECURITY DEFINER functions
-- Without SET search_path, these run as postgres and could be
-- redirected to attacker-controlled schema objects.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Delete logs older than 7 years (HIPAA requirement: 6 years minimum)
  DELETE FROM public.audit_logs
  WHERE created_at < NOW() - INTERVAL '7 years';
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  user_role TEXT;
  user_full_name TEXT;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'staff');
  IF user_role NOT IN ('doctor', 'nurse', 'staff', 'admin') THEN
    user_role := 'staff';
  END IF;
  user_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.email
  );
  BEGIN
    INSERT INTO public.profiles (id, uid, role, full_name, email, active)
    VALUES (gen_random_uuid(), NEW.id, user_role, user_full_name, NEW.email, true);
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.profiles SET
      role = user_role,
      full_name = COALESCE(user_full_name, full_name),
      email = COALESCE(NEW.email, email),
      updated_at = NOW()
    WHERE uid = NEW.id;
  WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$function$;
