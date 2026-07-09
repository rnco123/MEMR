-- One Form I-693 per patient (not per encounter). Keep encounter_id as the
-- encounter where the form was first created.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY patient_id
      ORDER BY
        CASE status
          WHEN 'exported' THEN 4
          WHEN 'reviewed' THEN 3
          WHEN 'ai_filled' THEN 2
          ELSE 1
        END DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
    ) AS rn
  FROM public.i693_submissions
)
DELETE FROM public.i693_submissions
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE public.i693_submissions
  DROP CONSTRAINT IF EXISTS i693_submissions_encounter_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_i693_submissions_patient_unique
  ON public.i693_submissions (patient_id);

COMMENT ON TABLE public.i693_submissions IS
  'Digital Form I-693 data per patient (one row); encounter_id is where the form was first created';
