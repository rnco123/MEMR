-- Clinic manager: an operations-only role scoped to one tenant.
-- A clinic manager manages their own tenant's staff and locations and sees no patient
-- data. Every clinical RLS policy and API allowlists roles, so the new role is denied
-- by default; access is granted only through app/api/manage, which scopes every query
-- to profiles.tenant_id. MEMR admins keep seeing all staff in Admin → Users.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin', 'clinic_manager']));

-- Owning tenant for clinic managers and the staff they add. NULL for MEMR admins and
-- staff created by MEMR admins, who stay scoped by user_locations as before.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles (tenant_id) WHERE tenant_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.tenant_id IS
  'Tenant a clinic_manager manages, or the tenant a manager-created staff member belongs to.';
