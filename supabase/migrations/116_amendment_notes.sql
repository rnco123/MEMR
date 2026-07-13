-- Amendment notes: additive SOAP corrections after an encounter is completed.
-- Mirrors doctor_soapnotes SOAP columns; references the original doctor note.
-- Multiple amendment rows per encounter are allowed (append-only audit trail).

CREATE TABLE IF NOT EXISTS public.amendment_notes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id BIGINT NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  doctor_soapnote_id BIGINT NOT NULL REFERENCES public.doctor_soapnotes(id) ON DELETE CASCADE,
  doctor_id BIGINT NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  subjective_text TEXT,
  objective_text TEXT,
  assessment_text TEXT,
  plan_text TEXT,
  amended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amended_by_name TEXT,
  amended_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT amendment_notes_doctor_soapnote_encounter_fkey
    FOREIGN KEY (doctor_soapnote_id, encounter_id)
    REFERENCES public.doctor_soapnotes (id, encounter_id)
    ON DELETE CASCADE
);

COMMENT ON TABLE public.amendment_notes IS
  'Additive SOAP amendments after encounter completion. Original doctor_soapnotes row is never overwritten.';
COMMENT ON COLUMN public.amendment_notes.doctor_soapnote_id IS
  'Doctor SOAP note being amended; must belong to the same encounter.';
COMMENT ON COLUMN public.amendment_notes.doctor_id IS
  'Doctor who authored this amendment (typically the encounter doctor).';

-- doctor_soapnotes already has UNIQUE(encounter_id); add composite unique for FK pairing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctor_soapnotes_id_encounter_id
  ON public.doctor_soapnotes (id, encounter_id);

CREATE INDEX IF NOT EXISTS idx_amendment_notes_encounter_id
  ON public.amendment_notes (encounter_id);
CREATE INDEX IF NOT EXISTS idx_amendment_notes_doctor_soapnote_id
  ON public.amendment_notes (doctor_soapnote_id);
CREATE INDEX IF NOT EXISTS idx_amendment_notes_doctor_id
  ON public.amendment_notes (doctor_id);
CREATE INDEX IF NOT EXISTS idx_amendment_notes_created_at
  ON public.amendment_notes (encounter_id, created_at DESC);

-- Enforce: amendments only when encounter is completed; soap note must match encounter.
CREATE OR REPLACE FUNCTION public.validate_amendment_note_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  enc_status TEXT;
BEGIN
  SELECT e.status INTO enc_status
  FROM public.encounters e
  WHERE e.id = NEW.encounter_id;

  IF enc_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Amendment notes can only be added after the encounter is completed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.doctor_soapnotes ds
    WHERE ds.id = NEW.doctor_soapnote_id
      AND ds.encounter_id = NEW.encounter_id
  ) THEN
    RAISE EXCEPTION 'doctor_soapnote_id must reference a doctor SOAP note for this encounter';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_amendment_note_insert ON public.amendment_notes;
CREATE TRIGGER trg_validate_amendment_note_insert
  BEFORE INSERT ON public.amendment_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_amendment_note_insert();

ALTER TABLE public.amendment_notes ENABLE ROW LEVEL SECURITY;

-- Clinical staff can read amendments (same visibility as doctor SOAP notes + admins).
DROP POLICY IF EXISTS "Doctors can view amendment notes" ON public.amendment_notes;
CREATE POLICY "Doctors can view amendment notes"
  ON public.amendment_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
        AND profiles.role = 'doctor'
    )
  );

DROP POLICY IF EXISTS "Nurses can view amendment notes" ON public.amendment_notes;
CREATE POLICY "Nurses can view amendment notes"
  ON public.amendment_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
        AND profiles.role IN ('nurse', 'staff')
    )
  );

DROP POLICY IF EXISTS "Admins can view amendment notes" ON public.amendment_notes;
CREATE POLICY "Admins can view amendment notes"
  ON public.amendment_notes
  FOR SELECT
  USING (public.is_admin_user());

-- Only doctors may add amendments, and only for encounters they are assigned to.
DROP POLICY IF EXISTS "Doctors can insert amendment notes" ON public.amendment_notes;
CREATE POLICY "Doctors can insert amendment notes"
  ON public.amendment_notes
  FOR INSERT
  WITH CHECK (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    AND encounter_id IN (
      SELECT e.id
      FROM public.encounters e
      WHERE e.status = 'completed'
        AND e.doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    )
    AND doctor_soapnote_id IN (
      SELECT ds.id
      FROM public.doctor_soapnotes ds
      WHERE ds.encounter_id = amendment_notes.encounter_id
    )
  );

-- Append-only: no UPDATE or DELETE policies.
