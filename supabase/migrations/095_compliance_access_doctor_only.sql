-- Restrict compliance_access to doctor role only.
-- FNP and PA roles should not have compliance dashboard access.
-- Doctors assigned compliance can review all encounters at their assigned locations.

-- Strip compliance_access from fnp and pa (backfilled by 092)
UPDATE public.profiles
SET compliance_access = false
WHERE role IN ('fnp', 'pa')
  AND compliance_access = true;

-- Prevent future compliance_access grants to non-doctor roles via DB constraint.
-- Doctors and admins are the only allowed roles; admins bypass the flag entirely in app code.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_compliance_access_doctor_only;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_compliance_access_doctor_only
  CHECK (
    compliance_access = false
    OR role IN ('doctor', 'admin')
  );
