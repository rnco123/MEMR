-- ============================================
-- TELEMEDICINE SESSION TRANSCRIPTS
-- Store transcript by speaker, keyed by encounter_id
-- Format: Doctor (Name): message
-- ============================================

CREATE TABLE IF NOT EXISTS public.telemedicine_transcripts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id BIGINT NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  speaker_role TEXT NOT NULL CHECK (speaker_role IN ('doctor', 'nurse', 'staff', 'patient')),
  speaker_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.telemedicine_transcripts IS 'Telemedicine session transcript by speaker, stored per encounter.';
COMMENT ON COLUMN public.telemedicine_transcripts.speaker_role IS 'Role: doctor, nurse, staff, patient';
COMMENT ON COLUMN public.telemedicine_transcripts.speaker_name IS 'Display name of speaker (e.g. username, Nancy)';

CREATE INDEX IF NOT EXISTS idx_telemedicine_transcripts_encounter_id ON public.telemedicine_transcripts(encounter_id);
CREATE INDEX IF NOT EXISTS idx_telemedicine_transcripts_created_at ON public.telemedicine_transcripts(encounter_id, created_at);

ALTER TABLE public.telemedicine_transcripts ENABLE ROW LEVEL SECURITY;

-- Doctors can view transcripts for encounters they are assigned to or participate in
CREATE POLICY "Doctors can view transcripts"
  ON public.telemedicine_transcripts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid() AND profiles.role = 'doctor'
    )
  );

-- Nurses can view transcripts
CREATE POLICY "Nurses can view transcripts"
  ON public.telemedicine_transcripts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid() AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Doctors can insert transcripts for encounters assigned to them
CREATE POLICY "Doctors can insert transcripts"
  ON public.telemedicine_transcripts
  FOR INSERT
  WITH CHECK (
    speaker_role IN ('doctor', 'nurse', 'staff', 'patient')
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid() AND profiles.role = 'doctor'
    )
    AND encounter_id IN (
      SELECT id FROM public.encounters
      WHERE doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    )
  );

-- Nurses can insert transcripts (they transcribe the session)
CREATE POLICY "Nurses can insert transcripts"
  ON public.telemedicine_transcripts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid() AND profiles.role IN ('nurse', 'staff')
    )
  );
