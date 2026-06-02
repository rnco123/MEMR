-- I-693 immigration physical workflow (cases, tasks, program_type)

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS program_type TEXT;

COMMENT ON COLUMN public.encounters.program_type IS 'Workflow program key, e.g. immigration_i693';

CREATE INDEX IF NOT EXISTS idx_encounters_program_type ON public.encounters(program_type)
  WHERE program_type IS NOT NULL;

-- Backfill from rooming immigration consent
UPDATE public.encounters
SET program_type = 'immigration_i693'
WHERE program_type IS NULL
  AND consent_ack IS NOT NULL
  AND consent_ack ? 'immigration'
  AND COALESCE(consent_ack->>'immigration', '') <> '';

-- ---------------------------------------------------------------------------
-- immigration_cases — workflow state per encounter
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.immigration_cases (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id BIGINT NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'incomplete' CHECK (
    status IN ('incomplete', 'ready_review', 'completed', 'delivered')
  ),
  status_color TEXT NOT NULL DEFAULT 'red' CHECK (
    status_color IN ('red', 'yellow', 'green', 'blue')
  ),
  missing_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_lab_complete BOOLEAN NOT NULL DEFAULT false,
  is_vaccine_complete BOOLEAN NOT NULL DEFAULT false,
  is_intake_complete BOOLEAN NOT NULL DEFAULT false,
  is_md_signed BOOLEAN NOT NULL DEFAULT false,
  is_delivered BOOLEAN NOT NULL DEFAULT false,
  delivery_type TEXT CHECK (delivery_type IS NULL OR delivery_type IN ('pickup', 'mail', 'detention')),
  delivery_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (encounter_id)
);

CREATE INDEX IF NOT EXISTS idx_immigration_cases_status ON public.immigration_cases(status);
CREATE INDEX IF NOT EXISTS idx_immigration_cases_patient ON public.immigration_cases(patient_id);

-- ---------------------------------------------------------------------------
-- immigration_tasks — checklist items per case
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.immigration_tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES public.immigration_cases(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, task_type)
);

CREATE INDEX IF NOT EXISTS idx_immigration_tasks_case ON public.immigration_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_immigration_tasks_status ON public.immigration_tasks(status);

ALTER TABLE public.immigration_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.immigration_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinical staff select immigration_cases" ON public.immigration_cases;
DROP POLICY IF EXISTS "Clinical staff insert immigration_cases" ON public.immigration_cases;
DROP POLICY IF EXISTS "Clinical staff update immigration_cases" ON public.immigration_cases;
DROP POLICY IF EXISTS "Clinical staff select immigration_tasks" ON public.immigration_tasks;
DROP POLICY IF EXISTS "Clinical staff insert immigration_tasks" ON public.immigration_tasks;
DROP POLICY IF EXISTS "Clinical staff update immigration_tasks" ON public.immigration_tasks;

CREATE POLICY "Clinical staff select immigration_cases"
  ON public.immigration_cases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );

CREATE POLICY "Clinical staff insert immigration_cases"
  ON public.immigration_cases FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );

CREATE POLICY "Clinical staff update immigration_cases"
  ON public.immigration_cases FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );

CREATE POLICY "Clinical staff select immigration_tasks"
  ON public.immigration_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );

CREATE POLICY "Clinical staff insert immigration_tasks"
  ON public.immigration_tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );

CREATE POLICY "Clinical staff update immigration_tasks"
  ON public.immigration_tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );

COMMENT ON TABLE public.immigration_cases IS 'I-693 workflow status per immigration encounter';
COMMENT ON TABLE public.immigration_tasks IS 'Pending/completed checklist items for immigration cases';
