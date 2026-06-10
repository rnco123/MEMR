-- Align pharmacy RLS with prescriptions (041/070): production may use profiles.id = auth.uid()
-- while 026 only checked profiles.uid — clinical staff could not insert registry rows.

DROP POLICY IF EXISTS "Doctors and nurses can manage pharmacy" ON public.pharmacy;

CREATE POLICY "Clinical staff can manage pharmacy"
  ON public.pharmacy
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.uid = auth.uid() OR p.id = auth.uid())
      AND p.role IN ('doctor', 'nurse', 'staff', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.uid = auth.uid() OR p.id = auth.uid())
      AND p.role IN ('doctor', 'nurse', 'staff', 'admin')
    )
  );
