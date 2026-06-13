-- Patient info edit audit trail (encounter modal demographic corrections)

CREATE TABLE IF NOT EXISTS public.patient_info_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id BIGINT NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('update')),
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  editor_role TEXT,
  editor_name TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  gender TEXT,
  date_of_birth DATE,
  street_address TEXT,
  state TEXT,
  zip_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.patient_info_audit IS 'Audit trail for patient demographic edits from the encounter modal. Editable fields only; patient_code is system-generated on patients and is not stored here.';

CREATE INDEX IF NOT EXISTS idx_patient_info_audit_encounter_id ON public.patient_info_audit(encounter_id);
CREATE INDEX IF NOT EXISTS idx_patient_info_audit_patient_id ON public.patient_info_audit(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_info_audit_created_at ON public.patient_info_audit(created_at DESC);

ALTER TABLE public.patient_info_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinical staff can view patient info audit" ON public.patient_info_audit;
CREATE POLICY "Clinical staff can view patient info audit"
  ON public.patient_info_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff', 'admin')
    )
  );
