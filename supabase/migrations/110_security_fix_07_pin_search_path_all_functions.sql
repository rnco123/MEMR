-- Captured from live database into git for record-keeping.
-- Original applied version: 20260628150321 (2026-06-28) — already applied to STAGING + PRODUCTION.
-- Part of the June 2026 Supabase security-linter remediation batch (fixes 01-10).

-- ============================================================
-- SECURITY FIX 07: Pin search_path on all remaining functions
-- flagged by Supabase linter for mutable search_path.
-- These are trigger/utility functions — not SECURITY DEFINER —
-- but pinning is best practice to prevent schema confusion.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_compliance_staff_role(role_text text)
  RETURNS boolean LANGUAGE sql IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
AS $$ SELECT role_text IN ('doctor', 'fnp', 'pa', 'admin'); $$;

CREATE OR REPLACE FUNCTION public.is_physician_role(role_text text)
  RETURNS boolean LANGUAGE sql IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
AS $$ SELECT role_text IN ('doctor', 'fnp', 'pa'); $$;

CREATE OR REPLACE FUNCTION public.normalize_location_address(raw text)
  RETURNS text LANGUAGE sql IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
AS $$ SELECT lower(regexp_replace(trim(coalesce(raw, '')), '\s+', ' ', 'g')); $$;

CREATE OR REPLACE FUNCTION public.generate_patient_code()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.patient_code :=
    'PAT-' ||
    (SELECT location_code FROM public.locations WHERE id = NEW.location_id) ||
    '-' || NEW.id::text;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_appointment_code()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.appointment_code :=
    'APT-' ||
    (SELECT location_code FROM public.locations WHERE id = NEW.location_id) ||
    '-' || NEW.id::text;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_encounter_code()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.encounter_code :=
    'ENC-' || NEW.appointment_id || '-' || NEW.id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.encounters_set_patient_id_from_appointment()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.patient_id IS NULL AND NEW.appointment_id IS NOT NULL THEN
    SELECT a.patient_id INTO NEW.patient_id
    FROM public.appointments a
    WHERE a.id = NEW.appointment_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_doctors_updated_at()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_nurses_updated_at()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_doctor_availability_updated_at()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_patient_file_updated_at()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_treatment_types_updated_at()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_support_ticket_updated_at()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.touch_ticket_last_message_at()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.support_tickets
  SET last_message_at = NOW(), updated_at = NOW()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
  RETURNS trigger LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at, updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;
