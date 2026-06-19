-- Admin read access for patient file (patients, appointments, encounters).
-- Clinical staff policies already exist; admins were blocked by RLS on client queries.

DROP POLICY IF EXISTS "Admins can view all patients" ON public.patients;
CREATE POLICY "Admins can view all patients"
  ON public.patients
  FOR SELECT
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can view all appointments" ON public.appointments;
CREATE POLICY "Admins can view all appointments"
  ON public.appointments
  FOR SELECT
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can view all encounters" ON public.encounters;
CREATE POLICY "Admins can view all encounters"
  ON public.encounters
  FOR SELECT
  USING (public.is_admin_user());
