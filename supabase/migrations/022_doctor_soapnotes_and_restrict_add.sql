-- ============================================
-- DOCTOR SOAP NOTES TABLE
-- One AI SOAP (ai_soapnotes) + one Doctor SOAP (doctor_soapnotes) per encounter
-- Only doctors can add/edit doctor_soapnotes
-- ============================================

-- Create doctor_soapnotes table (one per encounter, written by doctor)
CREATE TABLE IF NOT EXISTS public.doctor_soapnotes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id BIGINT NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  doctor_id BIGINT NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  subjective_text TEXT,
  objective_text TEXT,
  assessment_text TEXT,
  plan_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(encounter_id)
);

COMMENT ON TABLE public.doctor_soapnotes IS 'Doctor-written SOAP notes, one per encounter. Only doctors can add/edit.';
COMMENT ON COLUMN public.doctor_soapnotes.encounter_id IS 'Links to encounter. One doctor SOAP per encounter.';
COMMENT ON COLUMN public.doctor_soapnotes.doctor_id IS 'Doctor who wrote this SOAP note.';

CREATE INDEX IF NOT EXISTS idx_doctor_soapnotes_encounter_id ON public.doctor_soapnotes(encounter_id);
CREATE INDEX IF NOT EXISTS idx_doctor_soapnotes_doctor_id ON public.doctor_soapnotes(doctor_id);

-- Enable RLS
ALTER TABLE public.doctor_soapnotes ENABLE ROW LEVEL SECURITY;

-- Doctors can view doctor_soapnotes (all, for encounters they work with)
CREATE POLICY "Doctors can view doctor_soapnotes"
  ON public.doctor_soapnotes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- Nurses can view doctor_soapnotes
CREATE POLICY "Nurses can view doctor_soapnotes"
  ON public.doctor_soapnotes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- ONLY doctors can insert doctor_soapnotes (must be assigned to encounter)
CREATE POLICY "Doctors can insert doctor_soapnotes"
  ON public.doctor_soapnotes
  FOR INSERT
  WITH CHECK (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    AND encounter_id IN (
      SELECT id FROM public.encounters
      WHERE doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    )
  );

-- ONLY doctors can update doctor_soapnotes (own notes)
CREATE POLICY "Doctors can update doctor_soapnotes"
  ON public.doctor_soapnotes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = doctor_soapnotes.doctor_id
      AND d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = doctor_soapnotes.doctor_id
      AND d.user_id = auth.uid()
    )
  );

-- ============================================
-- ADD encounter_id TO ai_soapnotes (if missing)
-- AI SOAP: one per encounter (via encounter_id or appointment_id)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_soapnotes' AND column_name = 'encounter_id'
  ) THEN
    ALTER TABLE public.ai_soapnotes
    ADD COLUMN encounter_id BIGINT REFERENCES public.encounters(id) ON DELETE CASCADE;

    CREATE INDEX IF NOT EXISTS idx_ai_soapnotes_encounter_id ON public.ai_soapnotes(encounter_id);
  END IF;
END $$;

-- ============================================
-- RESTRICT ai_soapnotes: only doctors can add/edit
-- Nurses: view only. AI/backend uses service role.
-- ============================================

DROP POLICY IF EXISTS "Nurses can manage ai_soapnotes" ON public.ai_soapnotes;

-- Nurses keep SELECT only (already have "Nurses can view ai_soapnotes")
-- Doctors keep full access for AI note edits if needed
