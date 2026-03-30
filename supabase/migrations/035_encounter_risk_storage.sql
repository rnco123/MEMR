-- Persist AI risk triage on encounters (nurse flow / encounter modal)
ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS risk_level TEXT,
  ADD COLUMN IF NOT EXISTS risk_rationale TEXT,
  ADD COLUMN IF NOT EXISTS risk_factors JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_assessed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'encounters_risk_level_check'
  ) THEN
    ALTER TABLE public.encounters
      ADD CONSTRAINT encounters_risk_level_check
      CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'severe'));
  END IF;
END $$;

COMMENT ON COLUMN public.encounters.risk_level IS 'AI triage level from intake/SOAP/vitals; informational only, not a diagnosis';
COMMENT ON COLUMN public.encounters.risk_rationale IS 'Short AI rationale for nurses';
COMMENT ON COLUMN public.encounters.risk_factors IS 'JSON array of bullet factors';
COMMENT ON COLUMN public.encounters.risk_assessed_at IS 'When risk was last computed';
