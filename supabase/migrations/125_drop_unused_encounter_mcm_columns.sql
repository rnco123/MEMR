-- Remove legacy MCM synchronization fields that have no application or database usage.
ALTER TABLE public.encounters
  DROP COLUMN IF EXISTS mcm_encounter_id,
  DROP COLUMN IF EXISTS mcm_sync_status;
