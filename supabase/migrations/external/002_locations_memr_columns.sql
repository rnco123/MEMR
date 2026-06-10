-- Additive MEMR-aligned columns on legacy public."Locations" (does not remove/rename existing columns).

ALTER TABLE public."Locations"
  ADD COLUMN IF NOT EXISTS location_code TEXT,
  ADD COLUMN IF NOT EXISTS google_map_url TEXT,
  ADD COLUMN IF NOT EXISTS opening_hours TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS memr_location_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_memr_location_id
  ON public."Locations"(memr_location_id)
  WHERE memr_location_id IS NOT NULL;

COMMENT ON COLUMN public."Locations".location_code IS 'MEMR admin location code (optional).';
COMMENT ON COLUMN public."Locations".google_map_url IS 'MEMR normalized Google Maps URL.';
COMMENT ON COLUMN public."Locations".opening_hours IS 'MEMR structured opening hours JSON.';
COMMENT ON COLUMN public."Locations".is_active IS 'MEMR active flag; legacy apps may ignore.';
COMMENT ON COLUMN public."Locations".memr_location_id IS 'Primary MEMR locations.id for admin sync.';

NOTIFY pgrst, 'reload schema';
