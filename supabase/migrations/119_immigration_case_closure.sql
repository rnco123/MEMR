-- Archive delivered I-693 workflow cases without removing patient documents.

ALTER TABLE public.immigration_cases
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_by_name TEXT;

CREATE INDEX IF NOT EXISTS idx_immigration_cases_open_delivered
  ON public.immigration_cases (status, closed_at)
  WHERE status = 'delivered';
