-- Structured nurse physical examination (IMM / I-693 Part 7 style) on encounters.
-- Superseded by 083_encounter_physical_examinations_table.sql (dedicated table + FK).

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS physical_examination JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.encounters.physical_examination IS
  'Structured nurse physical examination fields (measurements + systems review) before/during consultation.';

-- Migrate legacy free-text MA findings into remarks when present.
UPDATE public.encounters
SET physical_examination = jsonb_build_object('remarks', ma_exam_findings)
WHERE ma_exam_findings IS NOT NULL
  AND btrim(ma_exam_findings) <> ''
  AND (physical_examination IS NULL OR physical_examination = '{}'::jsonb);
