-- Cache transcript AI summary and Final Review catalog-matched suggestions on encounters.

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS transcript_summary_json JSONB;

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS final_review_suggestions_json JSONB;

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS final_review_suggestions_at TIMESTAMPTZ;

COMMENT ON COLUMN public.encounters.transcript_summary_json IS
  'Lightweight clinical summary from telemedicine transcript (ai-summary at end of call).';

COMMENT ON COLUMN public.encounters.final_review_suggestions_json IS
  'Catalog-matched Final Review suggestions (pre_sales, prescriptions, follow_up).';

COMMENT ON COLUMN public.encounters.final_review_suggestions_at IS
  'When final_review_suggestions_json was last generated.';
