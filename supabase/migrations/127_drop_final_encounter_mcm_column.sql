-- Remove the final unused legacy MCM synchronization field.
ALTER TABLE public.encounters
  DROP COLUMN IF EXISTS mcm_sync_last_attempt_at;
