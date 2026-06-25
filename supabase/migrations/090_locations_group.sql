-- Clinica parity: Locations."Group" from external Clinica DB (nullable).
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS location_group TEXT;

COMMENT ON COLUMN public.locations.location_group IS
  'Optional clinic group label (mirrors Clinica Locations."Group"). Matched by address during initial import; NULL when unassigned.';

CREATE INDEX IF NOT EXISTS idx_locations_location_group
  ON public.locations(location_group)
  WHERE location_group IS NOT NULL;
