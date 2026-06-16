-- H-12a, H-09: tighten audit log INSERT and enable RLS on tenants/locations.

-- ---------------------------------------------------------------------------
-- H-12a — Audit log forgery: users may only insert rows for themselves
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can create audit logs" ON public.audit_logs;

CREATE POLICY "Users insert own audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- H-09 — RLS on locations and tenants (clinical read scoped to assignments)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.id = auth.uid() OR p.uid = auth.uid())
      AND p.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_assigned_location_ids()
RETURNS SETOF bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ul.location_id
  FROM public.user_locations ul
  WHERE ul.user_uid = auth.uid()
  UNION
  SELECT d.location_id
  FROM public.doctors d
  WHERE d.user_id = auth.uid()
    AND d.location_id IS NOT NULL
  UNION
  SELECT n.location_id
  FROM public.nurses n
  WHERE n.user_id = auth.uid()
    AND n.location_id IS NOT NULL;
$$;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access locations" ON public.locations;
CREATE POLICY "Admins full access locations"
  ON public.locations
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "Clinical read assigned locations" ON public.locations;
CREATE POLICY "Clinical read assigned locations"
  ON public.locations
  FOR SELECT
  USING (
    public.is_admin_user()
    OR id IN (SELECT public.user_assigned_location_ids())
  );

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access tenants" ON public.tenants;
CREATE POLICY "Admins full access tenants"
  ON public.tenants
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "Clinical read tenants for assigned locations" ON public.tenants;
CREATE POLICY "Clinical read tenants for assigned locations"
  ON public.tenants
  FOR SELECT
  USING (
    public.is_admin_user()
    OR id IN (
      SELECT DISTINCT l.tenant_id
      FROM public.locations l
      WHERE l.id IN (SELECT public.user_assigned_location_ids())
    )
  );
