-- MEMR workflow scope (excludes QR/public intake, external payment gateway)
-- Prescriptions, rooming attestations, clinical orders, post-visit tasks, MA exam notes, consent JSON

-- ---------------------------------------------------------------------------
-- PRESCRIPTIONS (doctor-scoped; optional encounter_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prescriber_doctor_id BIGINT NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id BIGINT REFERENCES public.encounters(id) ON DELETE SET NULL,
  medication_name TEXT NOT NULL,
  dosage TEXT,
  instructions TEXT,
  quantity TEXT,
  refills INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'sent', 'cancelled')),
  external_rx_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_prescriber ON public.prescriptions(prescriber_doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON public.prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter ON public.prescriptions(encounter_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_created ON public.prescriptions(created_at DESC);

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors select own prescriptions"
  ON public.prescriptions FOR SELECT
  USING (prescriber_doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

CREATE POLICY "Doctors insert own prescriptions"
  ON public.prescriptions FOR INSERT
  WITH CHECK (prescriber_doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

CREATE POLICY "Doctors update own prescriptions"
  ON public.prescriptions FOR UPDATE
  USING (prescriber_doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()))
  WITH CHECK (prescriber_doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

CREATE POLICY "Doctors delete own prescriptions"
  ON public.prescriptions FOR DELETE
  USING (prescriber_doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- ENCOUNTER rooming / MA exam / in-room consent acknowledgments (JSON)
-- ---------------------------------------------------------------------------
ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS pharmacy_id BIGINT REFERENCES public.pharmacy(id) ON DELETE SET NULL;

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prescribing_location_ack_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ma_supervision_ack_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ready_for_doctor_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ma_exam_findings TEXT,
  ADD COLUMN IF NOT EXISTS consent_ack JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMENT ON COLUMN public.encounters.identity_verified_at IS 'MA verified patient identity in person';
COMMENT ON COLUMN public.encounters.prescribing_location_ack_at IS 'Prescribing location acknowledged for compliance';
COMMENT ON COLUMN public.encounters.ma_supervision_ack_at IS 'MA attests hybrid supervision / in-room';
COMMENT ON COLUMN public.encounters.ready_for_doctor_at IS 'Patient ready for provider; doctor may join';
COMMENT ON COLUMN public.encounters.ma_exam_findings IS 'Structured or free-text MA findings during exam';
COMMENT ON COLUMN public.encounters.consent_ack IS 'JSON keys: telemedicine, hipaa, cash_pay, texas_ai, surgery, no_insurance, immigration, dot, ma_supervision — ISO timestamps when acknowledged';

-- ---------------------------------------------------------------------------
-- CLINICAL ORDERS (lab, injection, immunization, POC, referral)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.encounter_orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id BIGINT NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  ordered_by_doctor_id BIGINT REFERENCES public.doctors(id) ON DELETE SET NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('lab_draw', 'injection', 'immunization', 'poc_test', 'referral', 'other')),
  title TEXT NOT NULL,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  completed_by_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_encounter_orders_encounter ON public.encounter_orders(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_orders_status ON public.encounter_orders(status);

ALTER TABLE public.encounter_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinical staff select encounter_orders"
  ON public.encounter_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );

CREATE POLICY "Clinical staff insert encounter_orders"
  ON public.encounter_orders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );

CREATE POLICY "Clinical staff update encounter_orders"
  ON public.encounter_orders FOR UPDATE
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

CREATE POLICY "Clinical staff delete encounter_orders"
  ON public.encounter_orders FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );

-- ---------------------------------------------------------------------------
-- POST-VISIT TASKS (reminders, lab follow-up, escalation — no payment)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_visit_tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id BIGINT REFERENCES public.encounters(id) ON DELETE SET NULL,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('follow_up_reminder', 'lab_review', 'rx_review', 'escalation', 'callback', 'other')),
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_visit_tasks_patient ON public.post_visit_tasks(patient_id);
CREATE INDEX IF NOT EXISTS idx_post_visit_tasks_due ON public.post_visit_tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_post_visit_tasks_status ON public.post_visit_tasks(status);

ALTER TABLE public.post_visit_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinical staff post_visit_tasks_all"
  ON public.post_visit_tasks FOR ALL
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
