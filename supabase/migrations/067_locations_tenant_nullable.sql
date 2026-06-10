-- Allow locations without a tenant (primary MEMR project).

ALTER TABLE public.locations
  ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE public.locations
  ALTER COLUMN tenant_id DROP DEFAULT;

COMMENT ON COLUMN public.locations.tenant_id IS 'Optional owning tenant for this clinic location.';
