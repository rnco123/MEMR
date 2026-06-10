-- Admin-managed clinic location details (hours, contact, map link, active flag).

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS opening_hours TEXT,
  ADD COLUMN IF NOT EXISTS google_map_url TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.locations
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_locations_is_active ON public.locations(is_active);

COMMENT ON COLUMN public.locations.phone IS 'Clinic phone number for staff/patient reference.';
COMMENT ON COLUMN public.locations.opening_hours IS 'Human-readable clinic hours, e.g. Mon-Fri 9:00 AM – 5:00 PM.';
COMMENT ON COLUMN public.locations.google_map_url IS 'Normalized Google Maps link for directions.';
COMMENT ON COLUMN public.locations.is_active IS 'When false, location is hidden from clinical filters and assignment pickers.';
