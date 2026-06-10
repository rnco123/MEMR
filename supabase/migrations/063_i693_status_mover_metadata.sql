-- Track the latest user who manually moved an I-693 case between workflow states.

ALTER TABLE public.immigration_cases
  ADD COLUMN IF NOT EXISTS status_updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_immigration_cases_status_updated_by
  ON public.immigration_cases(status_updated_by);

COMMENT ON COLUMN public.immigration_cases.status_updated_by IS
  'Auth user who most recently moved the I-693 workflow status manually.';
COMMENT ON COLUMN public.immigration_cases.status_updated_by_name IS
  'Snapshot display name for the most recent manual I-693 workflow status mover.';
COMMENT ON COLUMN public.immigration_cases.status_updated_at IS
  'Timestamp of the most recent manual I-693 workflow status move.';
