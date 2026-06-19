-- Physical examination record per encounter (single row, audit on same row — no version history).
-- All exam columns are nullable; every field is optional at save time.

CREATE TABLE IF NOT EXISTS public.encounter_physical_examinations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id BIGINT NOT NULL UNIQUE REFERENCES public.encounters(id) ON DELETE CASCADE,
  height TEXT,
  weight TEXT,
  bmi TEXT,
  blood_pressure TEXT,
  pulse TEXT,
  temperature TEXT,
  general_appearance TEXT,
  eyes_ears_nose_throat TEXT,
  cardiovascular TEXT,
  pulmonary TEXT,
  abdomen TEXT,
  musculoskeletal TEXT,
  neurologic TEXT,
  psychiatric TEXT,
  skin TEXT,
  lymphatic TEXT,
  remarks TEXT,
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  editor_role TEXT,
  editor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.encounter_physical_examinations IS
  'One physical examination record per encounter (IMM / I-693 Part 7). All exam fields optional (nullable). Audit fields track last editor; no version history.';

CREATE INDEX IF NOT EXISTS idx_encounter_physical_examinations_encounter_id
  ON public.encounter_physical_examinations(encounter_id);

CREATE INDEX IF NOT EXISTS idx_encounter_physical_examinations_updated_at
  ON public.encounter_physical_examinations(updated_at DESC);

-- Migrate JSONB column from 081 when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'encounters'
      AND column_name = 'physical_examination'
  ) THEN
    INSERT INTO public.encounter_physical_examinations (
      encounter_id,
      height,
      weight,
      bmi,
      blood_pressure,
      pulse,
      temperature,
      general_appearance,
      eyes_ears_nose_throat,
      cardiovascular,
      pulmonary,
      abdomen,
      musculoskeletal,
      neurologic,
      psychiatric,
      skin,
      lymphatic,
      remarks
    )
    SELECT
      e.id,
      NULLIF(btrim(e.physical_examination->>'height'), ''),
      NULLIF(btrim(e.physical_examination->>'weight'), ''),
      NULLIF(btrim(e.physical_examination->>'bmi'), ''),
      NULLIF(btrim(e.physical_examination->>'blood_pressure'), ''),
      NULLIF(btrim(e.physical_examination->>'pulse'), ''),
      NULLIF(btrim(e.physical_examination->>'temperature'), ''),
      NULLIF(btrim(e.physical_examination->>'general_appearance'), ''),
      NULLIF(btrim(e.physical_examination->>'eyes_ears_nose_throat'), ''),
      NULLIF(btrim(e.physical_examination->>'cardiovascular'), ''),
      NULLIF(btrim(e.physical_examination->>'pulmonary'), ''),
      NULLIF(btrim(e.physical_examination->>'abdomen'), ''),
      NULLIF(btrim(e.physical_examination->>'musculoskeletal'), ''),
      NULLIF(btrim(e.physical_examination->>'neurologic'), ''),
      NULLIF(btrim(e.physical_examination->>'psychiatric'), ''),
      NULLIF(btrim(e.physical_examination->>'skin'), ''),
      NULLIF(btrim(e.physical_examination->>'lymphatic'), ''),
      NULLIF(btrim(e.physical_examination->>'remarks'), '')
    FROM public.encounters e
    WHERE e.physical_examination IS NOT NULL
      AND e.physical_examination <> '{}'::jsonb
    ON CONFLICT (encounter_id) DO NOTHING;

    ALTER TABLE public.encounters DROP COLUMN IF EXISTS physical_examination;
  END IF;
END $$;

-- Legacy free-text MA findings → remarks when no row exists yet.
INSERT INTO public.encounter_physical_examinations (encounter_id, remarks)
SELECT e.id, btrim(e.ma_exam_findings)
FROM public.encounters e
WHERE e.ma_exam_findings IS NOT NULL
  AND btrim(e.ma_exam_findings) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.encounter_physical_examinations pe
    WHERE pe.encounter_id = e.id
  );

ALTER TABLE public.encounter_physical_examinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinical staff can view encounter physical examinations"
  ON public.encounter_physical_examinations;
CREATE POLICY "Clinical staff can view encounter physical examinations"
  ON public.encounter_physical_examinations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  );
