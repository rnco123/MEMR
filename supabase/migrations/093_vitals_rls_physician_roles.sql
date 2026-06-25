-- Vitals RLS: match patients/encounters (039, 082) — physician roles (MD/FNP/PA),
-- id OR uid profile match, and admin read access.

DO $$
DECLARE
  has_id boolean;
  has_uid boolean;
  physician_expr text;
  nurse_expr text;
  admin_expr text;
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
    physician_expr := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE public.is_physician_role(p.role)
  AND (p.id = auth.uid() OR p.uid = auth.uid())
)
$e$;
    nurse_expr := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.role IN ('nurse', 'staff')
  AND (p.id = auth.uid() OR p.uid = auth.uid())
)
$e$;
    admin_expr := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.role = 'admin'
  AND (p.id = auth.uid() OR p.uid = auth.uid())
)
$e$;
  ELSIF has_id THEN
    physician_expr := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE public.is_physician_role(p.role)
  AND p.id = auth.uid()
)
$e$;
    nurse_expr := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.role IN ('nurse', 'staff')
  AND p.id = auth.uid()
)
$e$;
    admin_expr := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.role = 'admin'
  AND p.id = auth.uid()
)
$e$;
  ELSIF has_uid THEN
    physician_expr := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE public.is_physician_role(p.role)
  AND p.uid = auth.uid()
)
$e$;
    nurse_expr := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.role IN ('nurse', 'staff')
  AND p.uid = auth.uid()
)
$e$;
    admin_expr := $e$
EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.role = 'admin'
  AND p.uid = auth.uid()
)
$e$;
  ELSE
    RAISE EXCEPTION '093: public.profiles must have id or uid column';
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "Nurses can view vitals" ON public.vitals';
  EXECUTE 'DROP POLICY IF EXISTS "Nurses can manage vitals" ON public.vitals';
  EXECUTE 'DROP POLICY IF EXISTS "Doctors can view vitals" ON public.vitals';
  EXECUTE 'DROP POLICY IF EXISTS "Doctors can manage vitals" ON public.vitals';
  EXECUTE 'DROP POLICY IF EXISTS "Admins can view vitals" ON public.vitals';

  EXECUTE format(
    'CREATE POLICY "Nurses can view vitals" ON public.vitals FOR SELECT USING (%s)',
    nurse_expr
  );
  EXECUTE format(
    'CREATE POLICY "Nurses can manage vitals" ON public.vitals FOR ALL USING (%s) WITH CHECK (%s)',
    nurse_expr,
    nurse_expr
  );
  EXECUTE format(
    'CREATE POLICY "Doctors can view vitals" ON public.vitals FOR SELECT USING (%s)',
    physician_expr
  );
  EXECUTE format(
    'CREATE POLICY "Doctors can manage vitals" ON public.vitals FOR ALL USING (%s) WITH CHECK (%s)',
    physician_expr,
    physician_expr
  );
  EXECUTE format(
    'CREATE POLICY "Admins can view vitals" ON public.vitals FOR SELECT USING (%s)',
    admin_expr
  );
END $$;
