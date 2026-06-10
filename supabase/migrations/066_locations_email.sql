-- Clinic contact email on locations.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.locations.email IS 'Clinic contact email for staff/patient reference.';
