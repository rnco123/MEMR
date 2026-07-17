-- Patient registration source: QR app vs EMR direct (nurse) create.
-- Default QR classifies all existing rows without a data backfill.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS created_by_source text NOT NULL DEFAULT 'QR';

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_created_by_source_check;

ALTER TABLE public.patients
  ADD CONSTRAINT patients_created_by_source_check
  CHECK (created_by_source IN ('QR', 'Direct'));

COMMENT ON COLUMN public.patients.created_by_source IS
  'How the patient chart was created: QR (QR application intake) or Direct (clinic staff in EMR). Direct charts are EMR-only and must not sync to external Supabase.';

-- Optional emergency contact captured during manual (or later) registration.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS emergency_contact_name text;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text;

COMMENT ON COLUMN public.patients.emergency_contact_name IS
  'Optional emergency contact full name.';
COMMENT ON COLUMN public.patients.emergency_contact_phone IS
  'Optional emergency contact phone.';
COMMENT ON COLUMN public.patients.emergency_contact_relationship IS
  'Optional relationship of the emergency contact to the patient.';
