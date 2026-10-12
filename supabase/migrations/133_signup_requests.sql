-- Self-serve clinic signups awaiting MEMR approval.
-- The public signup form creates a banned auth user (so Supabase holds the password hash)
-- and one row here. Nothing else exists until an admin approves: approval creates the
-- tenant and location via mcm-bridge, the profile/staff/user_locations rows, and lifts
-- the ban. Rejection deletes the auth user. All writes go through mcm-bridge
-- (src/clinic-signups), which the EMR calls from app/api/auth/clinic-signup and
-- app/api/admin/signup-requests.

CREATE TABLE IF NOT EXISTS public.signup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),

  contact_name TEXT NOT NULL,
  -- The point of contact always becomes the tenant's clinic_manager (134_clinic_manager_role).
  email TEXT NOT NULL,

  tenant_name TEXT NOT NULL,
  location_name TEXT NOT NULL,
  location_address TEXT NOT NULL,
  location_phone TEXT NOT NULL,
  location_email TEXT NOT NULL,

  -- Filled in during approval; kept so a failed approval can be retried without
  -- creating a second tenant/location.
  tenant_id BIGINT,
  location_id BIGINT,

  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.signup_requests IS
  'Self-serve clinic signups (point of contact + tenant + first location) pending admin approval.';

-- One open request per email.
CREATE UNIQUE INDEX IF NOT EXISTS uq_signup_requests_pending_email
  ON public.signup_requests (lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_signup_requests_status_created
  ON public.signup_requests (status, created_at DESC);

ALTER TABLE public.signup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view signup requests" ON public.signup_requests;
CREATE POLICY "Admins can view signup requests"
  ON public.signup_requests
  FOR SELECT
  USING (public.is_admin_user());

CREATE OR REPLACE FUNCTION public.update_signup_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_signup_requests_updated_at ON public.signup_requests;
CREATE TRIGGER trg_signup_requests_updated_at
  BEFORE UPDATE ON public.signup_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_signup_requests_updated_at();
