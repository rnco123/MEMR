DROP POLICY IF EXISTS "Doctors can view assigned appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can manage assigned appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can view all appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can manage appointments" ON public.appointments;

-- Drop existing nurse policies to recreate them (ensure they work correctly)
DROP POLICY IF EXISTS "Nurses can view all appointments" ON public.appointments;
DROP POLICY IF EXISTS "Nurses can manage appointments" ON public.appointments;

CREATE POLICY "Doctors can view all appointments"
  ON public.appointments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- Policy: Doctors can manage appointments (they can update/delete any appointment)
CREATE POLICY "Doctors can manage appointments"
  ON public.appointments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

CREATE POLICY "Nurses can view all appointments"
  ON public.appointments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Nurses/Staff can manage appointments
CREATE POLICY "Nurses can manage appointments"
  ON public.appointments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );
