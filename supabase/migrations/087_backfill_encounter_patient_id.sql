-- Backfill encounters.patient_id from linked appointments.
-- Nurse flowboard historically created encounters with appointment_id only.

UPDATE public.encounters e
SET patient_id = a.patient_id
FROM public.appointments a
WHERE e.appointment_id = a.id
  AND e.patient_id IS NULL
  AND a.patient_id IS NOT NULL;
