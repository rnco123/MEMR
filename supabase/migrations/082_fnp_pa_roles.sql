-- Add Family Nurse Practitioner (FNP) and Physician Assistant (PA) staff roles.
-- Both have physician-level permissions (same as doctor) with distinct role names.

CREATE OR REPLACE FUNCTION public.is_physician_role(role_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT role_text IN ('doctor', 'fnp', 'pa');
$$;

COMMENT ON FUNCTION public.is_physician_role(text) IS
  'True for MD, FNP, and PA profile roles (physician-level clinical access).';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin'));

COMMENT ON COLUMN public.profiles.role IS
  'Valid values: doctor | fnp | pa | nurse | staff | admin';

-- Rebuild patients RLS (from 039) so FNP/PA can access patients like doctors.
DO $$
DECLARE
  has_id boolean;
  has_uid boolean;
  physician_select text;
  nurse_select text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id'
  ) INTO has_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'uid'
  ) INTO has_uid;

  IF has_id AND has_uid THEN
    physician_select := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE public.is_physician_role(p.role)
  AND (p.id = auth.uid() OR p.uid = auth.uid())
)
$e$;
    nurse_select := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.role IN ('nurse', 'staff')
  AND (p.id = auth.uid() OR p.uid = auth.uid())
)
$e$;
  ELSIF has_id THEN
    physician_select := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE public.is_physician_role(p.role)
  AND p.id = auth.uid()
)
$e$;
    nurse_select := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.role IN ('nurse', 'staff')
  AND p.id = auth.uid()
)
$e$;
  ELSIF has_uid THEN
    physician_select := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE public.is_physician_role(p.role)
  AND p.uid = auth.uid()
)
$e$;
    nurse_select := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.role IN ('nurse', 'staff')
  AND p.uid = auth.uid()
)
$e$;
  ELSE
    RAISE EXCEPTION '082: public.profiles must have id or uid column';
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "Doctors can view all patients" ON public.patients';
  EXECUTE 'DROP POLICY IF EXISTS "Doctors can manage patients" ON public.patients';
  EXECUTE 'DROP POLICY IF EXISTS "Nurses can view all patients" ON public.patients';
  EXECUTE 'DROP POLICY IF EXISTS "Nurses can manage patients" ON public.patients';

  EXECUTE format(
    'CREATE POLICY "Doctors can view all patients" ON public.patients FOR SELECT USING (%s)',
    physician_select
  );
  EXECUTE format(
    'CREATE POLICY "Doctors can manage patients" ON public.patients FOR ALL USING (%s) WITH CHECK (%s)',
    physician_select,
    physician_select
  );
  EXECUTE format(
    'CREATE POLICY "Nurses can view all patients" ON public.patients FOR SELECT USING (%s)',
    nurse_select
  );
  EXECUTE format(
    'CREATE POLICY "Nurses can manage patients" ON public.patients FOR ALL USING (%s) WITH CHECK (%s)',
    nurse_select,
    nurse_select
  );
END $$;

-- Encounters: physician roles can view all encounters (028).
DROP POLICY IF EXISTS "Doctors can view all encounters" ON public.encounters;

DO $$
DECLARE
  has_id boolean;
  has_uid boolean;
  physician_select text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id'
  ) INTO has_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'uid'
  ) INTO has_uid;

  IF has_id AND has_uid THEN
    physician_select := $e$
EXISTS (
  SELECT 1 FROM public.profiles
  WHERE public.is_physician_role(profiles.role)
  AND (profiles.id = auth.uid() OR profiles.uid = auth.uid())
)
$e$;
  ELSIF has_id THEN
    physician_select := $e$
EXISTS (
  SELECT 1 FROM public.profiles
  WHERE public.is_physician_role(profiles.role)
  AND profiles.id = auth.uid()
)
$e$;
  ELSIF has_uid THEN
    physician_select := $e$
EXISTS (
  SELECT 1 FROM public.profiles
  WHERE public.is_physician_role(profiles.role)
  AND profiles.uid = auth.uid()
)
$e$;
  ELSE
    RAISE EXCEPTION '082: public.profiles must have id or uid column';
  END IF;

  EXECUTE format(
    'CREATE POLICY "Doctors can view all encounters" ON public.encounters FOR SELECT USING (%s)',
    physician_select
  );
END $$;
