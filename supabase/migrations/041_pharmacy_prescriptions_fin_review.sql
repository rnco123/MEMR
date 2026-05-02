-- EMR pharmacy + prescriptions: align with Final Review Pharmacy Order (local DB only).
-- Table names stay `pharmacy` and `prescriptions` (existing); extends columns from user spec.

-- ---------------------------------------------------------------------------
-- PHARMACY (extend 026)
-- ---------------------------------------------------------------------------
ALTER TABLE public.pharmacy ADD COLUMN IF NOT EXISTS city character varying(100);
ALTER TABLE public.pharmacy ADD COLUMN IF NOT EXISTS state character varying(50);
ALTER TABLE public.pharmacy ADD COLUMN IF NOT EXISTS zip_code character varying(20);
ALTER TABLE public.pharmacy ADD COLUMN IF NOT EXISTS phone_number character varying(20);
ALTER TABLE public.pharmacy ADD COLUMN IF NOT EXISTS spanish_language_service boolean;
ALTER TABLE public.pharmacy ADD COLUMN IF NOT EXISTS disabled_access boolean;
ALTER TABLE public.pharmacy ADD COLUMN IF NOT EXISTS license_status character varying(50);
ALTER TABLE public.pharmacy ADD COLUMN IF NOT EXISTS opening_hours jsonb;
ALTER TABLE public.pharmacy ADD COLUMN IF NOT EXISTS delivers boolean DEFAULT true;
ALTER TABLE public.pharmacy ADD COLUMN IF NOT EXISTS delivered_to_status_updated timestamp with time zone;
ALTER TABLE public.pharmacy ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ---------------------------------------------------------------------------
-- PRESCRIPTIONS (extend 033 / 038): clinical detail fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS strength character varying(50);
ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS dosage_instruction character varying(150);
ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS route character varying(50);
ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS frequency character varying(50);
ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS duration character varying(50);

-- ---------------------------------------------------------------------------
-- RLS: allow nurses/staff to manage prescriptions (Final Review), alongside doctor policies
-- ---------------------------------------------------------------------------
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
