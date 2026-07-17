-- Remove the remaining unused legacy MCM synchronization fields.
ALTER TABLE public.encounters
  DROP COLUMN IF EXISTS mcm_synced_at,
  DROP COLUMN IF EXISTS mcm_sync_error;
