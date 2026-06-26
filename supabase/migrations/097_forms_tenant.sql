-- Consent form templates scoped per tenant (clinic organization).

ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES public.tenants(id) ON DELETE RESTRICT;

UPDATE public.forms
SET tenant_id = 1
WHERE tenant_id IS NULL;

ALTER TABLE public.forms
  ALTER COLUMN tenant_id SET DEFAULT 1;

ALTER TABLE public.forms
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_forms_tenant_active ON public.forms(tenant_id, is_active);

COMMENT ON COLUMN public.forms.tenant_id IS 'Tenant that owns this consent form template; shown on encounters at locations under this tenant.';

-- Admin manage forms via service role / admin API
DROP POLICY IF EXISTS "forms_admin_all" ON public.forms;
CREATE POLICY "forms_admin_all"
  ON public.forms FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());
