-- ============================================
-- Let doctors view all encounters (support profiles.id for auth)
-- Fixes flowboard View not opening when encounter query returns [] due to RLS.
-- If your profiles table uses only uid (no id), replace with:
--   USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.uid = auth.uid() AND profiles.role = 'doctor'));
-- ============================================

DROP POLICY IF EXISTS "Doctors can view all encounters" ON public.encounters;

-- Use profiles.id so doctors can view all encounters (production schema per 024)
CREATE POLICY "Doctors can view all encounters"
  ON public.encounters
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.role = 'doctor'
      AND profiles.id = auth.uid()
    )
  );
