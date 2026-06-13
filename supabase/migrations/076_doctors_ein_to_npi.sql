-- Rename doctors.ein to doctors.npi (National Provider Identifier).
ALTER TABLE public.doctors
  RENAME COLUMN ein TO npi;

COMMENT ON COLUMN public.doctors.npi IS 'Optional US NPI (10 digits); included on pharmacy prescription emails when set.';
