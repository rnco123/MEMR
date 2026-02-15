-- ============================================
-- FIX RLS POLICIES FOR NEW SCHEMA
-- Updates RLS policies to use correct column names (user_id instead of doctor_id)
-- ============================================

-- ============================================
-- PATIENTS TABLE
-- Fix doctor policies to use doctors.user_id instead of doctors.doctor_id
-- ============================================

-- Drop existing doctor policies
DROP POLICY IF EXISTS "Doctors can view all patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can manage patients" ON public.patients;

-- Policy: Doctors can view all patients (using doctors.user_id)
CREATE POLICY "Doctors can view all patients"
  ON public.patients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM public.doctors
        WHERE doctors.user_id = profiles.uid
      )
    )
  );

-- Policy: Doctors can insert/update/delete patients
CREATE POLICY "Doctors can manage patients"
  ON public.patients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM public.doctors
        WHERE doctors.user_id = profiles.uid
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM public.doctors
        WHERE doctors.user_id = profiles.uid
      )
    )
  );

-- ============================================
-- APPOINTMENTS TABLE
-- Fix doctor policies to use doctors.user_id
-- ============================================

-- Drop existing doctor policies
DROP POLICY IF EXISTS "Doctors can view assigned appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can manage assigned appointments" ON public.appointments;

-- Policy: Doctors can view appointments assigned to them via encounters
CREATE POLICY "Doctors can view assigned appointments"
  ON public.appointments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM public.doctors
        WHERE doctors.user_id = profiles.uid
        AND EXISTS (
          SELECT 1 FROM public.encounters e
          WHERE e.appointment_id = appointments.id
          AND e.doctor_id = doctors.id
        )
      )
    )
  );

-- Policy: Doctors can manage their assigned appointments
CREATE POLICY "Doctors can manage assigned appointments"
  ON public.appointments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM public.doctors
        WHERE doctors.user_id = profiles.uid
        AND EXISTS (
          SELECT 1 FROM public.encounters e
          WHERE e.appointment_id = appointments.id
          AND e.doctor_id = doctors.id
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM public.doctors
        WHERE doctors.user_id = profiles.uid
        AND EXISTS (
          SELECT 1 FROM public.encounters e
          WHERE e.appointment_id = appointments.id
          AND e.doctor_id = doctors.id
        )
      )
    )
  );

-- ============================================
-- ENCOUNTERS TABLE
-- Fix doctor policies to use doctors.user_id
-- ============================================

-- Drop existing doctor policies
DROP POLICY IF EXISTS "Doctors can view all encounters" ON public.encounters;
DROP POLICY IF EXISTS "Doctors can manage own encounters" ON public.encounters;

-- Policy: Doctors can view all encounters
CREATE POLICY "Doctors can view all encounters"
  ON public.encounters
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM public.doctors
        WHERE doctors.user_id = profiles.uid
      )
    )
  );

-- Policy: Doctors can manage their own encounters
CREATE POLICY "Doctors can manage own encounters"
  ON public.encounters
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM public.doctors
        WHERE doctors.user_id = profiles.uid
        AND encounters.doctor_id = doctors.id
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM public.doctors
        WHERE doctors.user_id = profiles.uid
        AND encounters.doctor_id = doctors.id
      )
    )
  );

-- ============================================
-- SUMMARY
-- ============================================
-- Fixed RLS policies to use:
-- - doctors.user_id instead of doctors.doctor_id
-- - doctors.id for encounters.doctor_id (BIGINT)
-- - appointments.id instead of appointments.appointment_id
-- - encounters.id instead of encounters.eid
--
-- This aligns with the new schema structure where:
-- - doctors.user_id (UUID) references auth.users(id)
-- - doctors.id (BIGINT) is the primary key
-- - encounters.doctor_id (BIGINT) references doctors.id
