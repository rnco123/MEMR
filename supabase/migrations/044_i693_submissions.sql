-- Form I-693 digital submissions (immigration medical exam)
CREATE TABLE IF NOT EXISTS public.i693_submissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id BIGINT NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ai_filled', 'reviewed', 'exported')),
  ai_filled_at TIMESTAMPTZ,
  ai_model TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  pdf_storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (encounter_id)
);

CREATE INDEX IF NOT EXISTS idx_i693_submissions_patient ON public.i693_submissions(patient_id);
CREATE INDEX IF NOT EXISTS idx_i693_submissions_status ON public.i693_submissions(status);

ALTER TABLE public.i693_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinical staff select i693_submissions" ON public.i693_submissions;
DROP POLICY IF EXISTS "Clinical staff insert i693_submissions" ON public.i693_submissions;
DROP POLICY IF EXISTS "Clinical staff update i693_submissions" ON public.i693_submissions;

CREATE POLICY "Clinical staff select i693_submissions"
  ON public.i693_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );

CREATE POLICY "Clinical staff insert i693_submissions"
  ON public.i693_submissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );

CREATE POLICY "Clinical staff update i693_submissions"
  ON public.i693_submissions FOR UPDATE
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

COMMENT ON TABLE public.i693_submissions IS 'Digital Form I-693 data per encounter; export to USCIS fillable PDF';
