-- Physician sends prescriptions to admin queue (manual pharmacy workflow; no e-Rx).

CREATE TABLE IF NOT EXISTS public.prescription_ready (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id BIGINT NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  prescription_id BIGINT NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  pharmacy_id BIGINT REFERENCES public.pharmacy(id) ON DELETE SET NULL,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_doctor_id BIGINT REFERENCES public.doctors(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL,
  sender_name TEXT,
  admin_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (admin_status IN ('pending', 'sent_to_pharmacy')),
  sent_to_admin_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  admin_status_updated_at TIMESTAMPTZ,
  admin_status_updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT prescription_ready_prescription_id_key UNIQUE (prescription_id)
);

COMMENT ON TABLE public.prescription_ready IS
  'Queue for admin to manually send prescriptions to pharmacy after physician release.';

CREATE INDEX IF NOT EXISTS idx_prescription_ready_encounter_id ON public.prescription_ready(encounter_id);
CREATE INDEX IF NOT EXISTS idx_prescription_ready_pharmacy_id ON public.prescription_ready(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_prescription_ready_admin_status ON public.prescription_ready(admin_status);
CREATE INDEX IF NOT EXISTS idx_prescription_ready_sent_to_admin_at ON public.prescription_ready(sent_to_admin_at DESC);

ALTER TABLE public.prescription_ready ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinical staff can view prescription ready" ON public.prescription_ready;
CREATE POLICY "Clinical staff can view prescription ready"
  ON public.prescription_ready
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  );
