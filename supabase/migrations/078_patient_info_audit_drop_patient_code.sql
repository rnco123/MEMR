-- patient_code is system-generated; remove from audit if an earlier 077 revision included it.
ALTER TABLE public.patient_info_audit
  DROP COLUMN IF EXISTS patient_code;

COMMENT ON TABLE public.patient_info_audit IS 'Audit trail for patient demographic edits from the encounter modal. Editable fields only; patient_code lives on patients and is never changed here.';
