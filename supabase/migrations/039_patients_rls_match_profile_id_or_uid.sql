-- Align patients RLS with encounters (028): production may use profiles.id = auth.uid()
-- while 011 only checked profiles.uid — doctors could read encounters/appointments but not patients.
-- This migration rebuilds patients policies using id and/or uid depending on what exists.

DO $$
DECLARE
  has_id boolean;
  has_uid boolean;
  doctor_select text;
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
    doctor_select := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.role = 'doctor'
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
    doctor_select := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.role = 'doctor'
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
    doctor_select := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.role = 'doctor'
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
    RAISE EXCEPTION '039: public.profiles must have id or uid column';
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "Doctors can view all patients" ON public.patients';
  EXECUTE 'DROP POLICY IF EXISTS "Doctors can manage patients" ON public.patients';
  EXECUTE 'DROP POLICY IF EXISTS "Nurses can view all patients" ON public.patients';
  EXECUTE 'DROP POLICY IF EXISTS "Nurses can manage patients" ON public.patients';

  EXECUTE format(
    'CREATE POLICY "Doctors can view all patients" ON public.patients FOR SELECT USING (%s)',
    doctor_select
  );
  EXECUTE format(
    'CREATE POLICY "Doctors can manage patients" ON public.patients FOR ALL USING (%s) WITH CHECK (%s)',
    doctor_select,
    doctor_select
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
