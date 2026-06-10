-- Store doctor and clinic snapshot on pharmacy email sends.

ALTER TABLE public.pharm_email_log
  ADD COLUMN IF NOT EXISTS doctor_id BIGINT REFERENCES public.doctors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS doctor_name TEXT,
  ADD COLUMN IF NOT EXISTS doctor_phone TEXT,
  ADD COLUMN IF NOT EXISTS doctor_email TEXT,
  ADD COLUMN IF NOT EXISTS clinic_location_id BIGINT REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clinic_name TEXT,
  ADD COLUMN IF NOT EXISTS clinic_address TEXT,
  ADD COLUMN IF NOT EXISTS clinic_phone TEXT,
  ADD COLUMN IF NOT EXISTS clinic_email TEXT;

CREATE INDEX IF NOT EXISTS idx_pharm_email_log_doctor_id
  ON public.pharm_email_log(doctor_id);

CREATE INDEX IF NOT EXISTS idx_pharm_email_log_clinic_location_id
  ON public.pharm_email_log(clinic_location_id);
