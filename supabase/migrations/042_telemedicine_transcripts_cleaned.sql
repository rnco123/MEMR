-- Per-line cleaned transcript text (grammar/clarity) for final review
ALTER TABLE public.telemedicine_transcripts
  ADD COLUMN IF NOT EXISTS cleaned_transcript TEXT NULL;

COMMENT ON COLUMN public.telemedicine_transcripts.cleaned_transcript IS
  'AI-cleaned message text (grammar/punctuation/clarity only); null if not processed or skipped.';

-- RLS: allow updating cleaned_transcript on existing rows
CREATE POLICY "Doctors can update transcripts for their encounters"
  ON public.telemedicine_transcripts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid() AND profiles.role = 'doctor'
    )
    AND encounter_id IN (
      SELECT id FROM public.encounters
      WHERE doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid() AND profiles.role = 'doctor'
    )
    AND encounter_id IN (
      SELECT id FROM public.encounters
      WHERE doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Nurses can update transcripts"
  ON public.telemedicine_transcripts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid() AND profiles.role IN ('nurse', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid() AND profiles.role IN ('nurse', 'staff')
    )
  );
