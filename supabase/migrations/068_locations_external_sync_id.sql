-- Link primary MEMR location row to external "Locations" row after admin sync.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS external_location_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_external_location_id
  ON public.locations(external_location_id)
  WHERE external_location_id IS NOT NULL;

COMMENT ON COLUMN public.locations.external_location_id IS 'Optional id of matching row in external Supabase Locations table.';
