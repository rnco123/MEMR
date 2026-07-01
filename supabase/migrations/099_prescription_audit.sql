-- Prescription edit audit trail (encounter modal + Final Review)

CREATE TABLE IF NOT EXISTS public.prescription_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id BIGINT NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  prescription_id BIGINT REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'cancel')),
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  editor_role TEXT,
  editor_name TEXT,
  medication_name TEXT,
  strength TEXT,
  dosage_instruction TEXT,
  route TEXT,
  frequency TEXT,
  duration TEXT,
  quantity TEXT,
  refills INTEGER,
  notes TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.prescription_audit IS 'Audit trail for encounter prescription create/update/cancel actions.';

CREATE INDEX IF NOT EXISTS idx_prescription_audit_encounter_id ON public.prescription_audit(encounter_id);
CREATE INDEX IF NOT EXISTS idx_prescription_audit_prescription_id ON public.prescription_audit(prescription_id);
CREATE INDEX IF NOT EXISTS idx_prescription_audit_created_at ON public.prescription_audit(created_at DESC);

ALTER TABLE public.prescription_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinical staff can view prescription audit" ON public.prescription_audit;
CREATE POLICY "Clinical staff can view prescription audit"
  ON public.prescription_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  );
