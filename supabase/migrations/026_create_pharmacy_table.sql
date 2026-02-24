-- ============================================
-- CREATE PHARMACY TABLE
-- Used by encounters.pharmacy_id; avoids 400 when video/details fetch pharmacy
-- ============================================

CREATE TABLE IF NOT EXISTS public.pharmacy (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.pharmacy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pharmacy"
  ON public.pharmacy
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Doctors and nurses can manage pharmacy"
  ON public.pharmacy
  FOR ALL
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

CREATE INDEX IF NOT EXISTS idx_pharmacy_id ON public.pharmacy(id);
