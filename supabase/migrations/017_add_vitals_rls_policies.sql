-- ============================================
-- RLS POLICIES FOR VITALS TABLE
-- This allows nurses and doctors to manage vitals
-- ============================================

-- Enable Row Level Security on vitals table
ALTER TABLE public.vitals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Nurses can view vitals" ON public.vitals;
DROP POLICY IF EXISTS "Nurses can manage vitals" ON public.vitals;
DROP POLICY IF EXISTS "Doctors can view vitals" ON public.vitals;
DROP POLICY IF EXISTS "Doctors can manage vitals" ON public.vitals;

-- Policy: Nurses/Staff can view ALL vitals
CREATE POLICY "Nurses can view vitals"
  ON public.vitals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Nurses/Staff can manage vitals (INSERT, UPDATE, DELETE)
CREATE POLICY "Nurses can manage vitals"
  ON public.vitals
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

-- Policy: Doctors can view ALL vitals
CREATE POLICY "Doctors can view vitals"
  ON public.vitals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- Policy: Doctors can manage vitals (INSERT, UPDATE, DELETE)
CREATE POLICY "Doctors can manage vitals"
  ON public.vitals
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
