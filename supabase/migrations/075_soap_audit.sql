-- SOAP edit audit trail (doctor_soapnotes saves from encounter modal)

CREATE TABLE IF NOT EXISTS public.soap_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id BIGINT NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  doctor_soapnote_id BIGINT REFERENCES public.doctor_soapnotes(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update')),
  source TEXT NOT NULL CHECK (source IN ('ai_seed', 'doctor_soap', 'manual')),
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  editor_role TEXT,
  editor_name TEXT,
  subjective_text TEXT,
  objective_text TEXT,
  assessment_text TEXT,
  plan_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.soap_audit IS 'Audit trail for doctor SOAP note edits in the encounter workflow.';
COMMENT ON COLUMN public.soap_audit.source IS 'ai_seed = first save copied from AI SOAP; doctor_soap = edit of existing doctor note; manual = blank start.';

CREATE INDEX IF NOT EXISTS idx_soap_audit_encounter_id ON public.soap_audit(encounter_id);
CREATE INDEX IF NOT EXISTS idx_soap_audit_created_at ON public.soap_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_soap_audit_edited_by ON public.soap_audit(edited_by);

ALTER TABLE public.soap_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinical staff can view soap audit" ON public.soap_audit;
CREATE POLICY "Clinical staff can view soap audit"
  ON public.soap_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('doctor', 'nurse', 'staff', 'admin')
    )
  );
