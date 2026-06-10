-- Stamp when prescription emails are sent to a pharmacy.

CREATE TABLE IF NOT EXISTS public.pharm_email_log (
  id BIGSERIAL PRIMARY KEY,
  encounter_id BIGINT NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  pharmacy_id BIGINT NOT NULL REFERENCES public.pharmacy(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pharm_email_log_encounter_id
  ON public.pharm_email_log(encounter_id);

CREATE INDEX IF NOT EXISTS idx_pharm_email_log_pharmacy_id
  ON public.pharm_email_log(pharmacy_id);

CREATE INDEX IF NOT EXISTS idx_pharm_email_log_sent_at
  ON public.pharm_email_log(sent_at DESC);

ALTER TABLE public.pharm_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinical staff can view pharm email log"
  ON public.pharm_email_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.uid = auth.uid() OR p.id = auth.uid())
      AND p.role IN ('doctor', 'nurse', 'staff', 'admin')
    )
  );

COMMENT ON TABLE public.pharm_email_log IS
  'Timestamp log when prescription emails are sent to pharmacies.';
