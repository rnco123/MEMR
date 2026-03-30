-- Ensure public.encounters has patient_id (app + PostgREST expect this name).
-- Fixes: 42703 column encounters.patient_id does not exist when DB still uses pid
-- or older DBs never added the column.

-- 1) Rename legacy pid → patient_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'encounters' AND column_name = 'pid'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'encounters' AND column_name = 'patient_id'
  ) THEN
    ALTER TABLE public.encounters RENAME COLUMN pid TO patient_id;
  END IF;
END $$;

-- 2) Add patient_id if still missing (derive type from patients.id)
DO $$
DECLARE
  col_type text;
  udt text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'encounters' AND column_name = 'patient_id'
  ) THEN
    RETURN;
  END IF;

  SELECT c.data_type, c.udt_name INTO col_type, udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'patients' AND c.column_name = 'id';

  IF col_type IS NULL THEN
    RAISE NOTICE '034: patients.id not found; cannot add encounters.patient_id';
    RETURN;
  END IF;

  IF udt = 'uuid' THEN
    ALTER TABLE public.encounters ADD COLUMN patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL;
  ELSIF udt = 'int8' OR col_type = 'bigint' THEN
    ALTER TABLE public.encounters ADD COLUMN patient_id BIGINT REFERENCES public.patients(id) ON DELETE SET NULL;
  ELSIF udt = 'int4' OR col_type = 'integer' THEN
    ALTER TABLE public.encounters ADD COLUMN patient_id INTEGER REFERENCES public.patients(id) ON DELETE SET NULL;
  ELSE
    RAISE NOTICE '034: unsupported patients.id udt=% — add encounters.patient_id manually to match patients.id', udt;
  END IF;
END $$;

-- 3) Backfill from appointments when linked by appointment_id
UPDATE public.encounters e
SET patient_id = a.patient_id
FROM public.appointments a
WHERE e.appointment_id = a.id
  AND e.patient_id IS NULL
  AND a.patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_encounters_patient_id ON public.encounters(patient_id);
