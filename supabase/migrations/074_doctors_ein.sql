-- Optional EIN (Employer Identification Number) for prescribing doctors.

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS ein TEXT;

COMMENT ON COLUMN public.doctors.ein IS 'Optional US EIN (XX-XXXXXXX); included on pharmacy prescription emails when set.';
