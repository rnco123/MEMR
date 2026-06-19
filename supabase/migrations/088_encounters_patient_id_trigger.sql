-- Always populate encounters.patient_id from the linked appointment when missing.
-- Covers client-side inserts (nurse flowboard) and any future code paths.

CREATE OR REPLACE FUNCTION public.encounters_set_patient_id_from_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.patient_id IS NULL AND NEW.appointment_id IS NOT NULL THEN
    SELECT a.patient_id
    INTO NEW.patient_id
    FROM public.appointments a
    WHERE a.id = NEW.appointment_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_encounters_set_patient_id ON public.encounters;

CREATE TRIGGER trg_encounters_set_patient_id
  BEFORE INSERT OR UPDATE OF appointment_id, patient_id
  ON public.encounters
  FOR EACH ROW
  EXECUTE FUNCTION public.encounters_set_patient_id_from_appointment();
