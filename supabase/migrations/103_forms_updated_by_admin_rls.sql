-- Track who last edited consent form templates; restrict writes to admins.

ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT;

CREATE INDEX IF NOT EXISTS idx_forms_updated_by ON public.forms(updated_by);

COMMENT ON COLUMN public.forms.updated_by IS 'Admin user who last modified this template.';
COMMENT ON COLUMN public.forms.updated_by_name IS 'Display name snapshot of updated_by at edit time.';

-- RLS: authenticated read; admin-only writes (service role bypasses RLS for admin API).

DROP POLICY IF EXISTS "forms_insert_service" ON public.forms;
DROP POLICY IF EXISTS "forms_update_service" ON public.forms;
DROP POLICY IF EXISTS "forms_admin_all" ON public.forms;

CREATE POLICY "forms_insert_admin"
  ON public.forms FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY "forms_update_admin"
  ON public.forms FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY "forms_delete_admin"
  ON public.forms FOR DELETE
  TO authenticated
  USING (public.is_admin_user());
