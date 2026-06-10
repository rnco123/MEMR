-- Prescription clinical detail + pharmacy routing (038 / 041 prescription parts).

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS pharmacy_id BIGINT REFERENCES public.pharmacy(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pharmacy_pulled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS strength character varying(50),
  ADD COLUMN IF NOT EXISTS dosage_instruction character varying(150),
  ADD COLUMN IF NOT EXISTS route character varying(50),
  ADD COLUMN IF NOT EXISTS frequency character varying(50),
  ADD COLUMN IF NOT EXISTS duration character varying(50);

CREATE INDEX IF NOT EXISTS idx_prescriptions_pharmacy_id
  ON public.prescriptions(pharmacy_id);

CREATE INDEX IF NOT EXISTS idx_prescriptions_pharmacy_pulled_at
  ON public.prescriptions(pharmacy_pulled_at DESC);

DROP POLICY IF EXISTS "Clinical staff manage prescriptions" ON public.prescriptions;

CREATE POLICY "Clinical staff manage prescriptions"
  ON public.prescriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.uid = auth.uid() OR p.id = auth.uid())
      AND p.role IN ('doctor', 'nurse', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.uid = auth.uid() OR p.id = auth.uid())
      AND p.role IN ('doctor', 'nurse', 'staff')
    )
  );
