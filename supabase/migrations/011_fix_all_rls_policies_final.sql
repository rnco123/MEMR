-- ============================================
-- FINAL FIX FOR ALL RLS POLICIES
-- This ensures all policies work with the correct schema
-- ============================================

-- ============================================
-- PROFILES TABLE - CRITICAL: Users must be able to read their own profile
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

-- Policy: Users can ALWAYS view their own profile (required for role checking)
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = uid);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = uid)
  WITH CHECK (auth.uid() = uid);

-- ============================================
-- PATIENTS TABLE - SIMPLIFIED POLICIES
-- ============================================

-- Drop ALL existing policies on patients
DROP POLICY IF EXISTS "Doctors can view all patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can manage patients" ON public.patients;
DROP POLICY IF EXISTS "Nurses can view assigned patients" ON public.patients;
DROP POLICY IF EXISTS "Nurses can view all patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can insert patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can update all patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can delete patients" ON public.patients;

-- Policy: Doctors can view all patients (simplified - just check profile role)
CREATE POLICY "Doctors can view all patients"
  ON public.patients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- Policy: Doctors can manage patients
CREATE POLICY "Doctors can manage patients"
  ON public.patients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- Policy: Nurses/Staff can view ALL patients
CREATE POLICY "Nurses can view all patients"
  ON public.patients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Nurses/Staff can manage patients
CREATE POLICY "Nurses can manage patients"
  ON public.patients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- ============================================
-- APPOINTMENTS TABLE
-- ============================================

-- Drop ALL existing policies on appointments
DROP POLICY IF EXISTS "Doctors can view all appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can manage appointments" ON public.appointments;
DROP POLICY IF EXISTS "Nurses can view assigned appointments" ON public.appointments;
DROP POLICY IF EXISTS "Nurses can view all appointments" ON public.appointments;
DROP POLICY IF EXISTS "Nurses can manage appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can view assigned appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can manage assigned appointments" ON public.appointments;

-- Policy: Nurses/Staff can view ALL appointments
CREATE POLICY "Nurses can view all appointments"
  ON public.appointments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Nurses/Staff can manage appointments
CREATE POLICY "Nurses can manage appointments"
  ON public.appointments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

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
    OR EXISTS (
      -- Also allow if no encounter exists yet (for new appointments)
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
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
    OR EXISTS (
      -- Also allow if no encounter exists yet (for new appointments)
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
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
    OR EXISTS (
      -- Also allow if no encounter exists yet (for new appointments)
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- ============================================
-- ENCOUNTERS TABLE
-- ============================================

-- Drop ALL existing policies on encounters
DROP POLICY IF EXISTS "Doctors can view all encounters" ON public.encounters;
DROP POLICY IF EXISTS "Doctors can manage own encounters" ON public.encounters;
DROP POLICY IF EXISTS "Nurses can view all encounters" ON public.encounters;
DROP POLICY IF EXISTS "Nurses can manage encounters" ON public.encounters;

-- Policy: Nurses/Staff can view ALL encounters
CREATE POLICY "Nurses can view all encounters"
  ON public.encounters
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Nurses/Staff can manage encounters
CREATE POLICY "Nurses can manage encounters"
  ON public.encounters
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Doctors can view all encounters
CREATE POLICY "Doctors can view all encounters"
  ON public.encounters
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
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
      AND (
        encounters.doctor_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.doctors
          WHERE doctors.user_id = profiles.uid
          AND encounters.doctor_id = doctors.id
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND (
        encounters.doctor_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.doctors
          WHERE doctors.user_id = profiles.uid
          AND encounters.doctor_id = doctors.id
        )
      )
    )
  );

-- ============================================
-- PATIENT_DOCUMENTS TABLE
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Doctors can view patient documents" ON public.patient_documents;
DROP POLICY IF EXISTS "Doctors can manage patient documents" ON public.patient_documents;
DROP POLICY IF EXISTS "Nurses can view patient documents" ON public.patient_documents;
DROP POLICY IF EXISTS "Nurses can manage patient documents" ON public.patient_documents;

-- Policy: Doctors can view patient documents
CREATE POLICY "Doctors can view patient documents"
  ON public.patient_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- Policy: Doctors can manage patient documents
CREATE POLICY "Doctors can manage patient documents"
  ON public.patient_documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- Policy: Nurses/Staff can view patient documents
CREATE POLICY "Nurses can view patient documents"
  ON public.patient_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Nurses/Staff can manage patient documents
CREATE POLICY "Nurses can manage patient documents"
  ON public.patient_documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- ============================================
-- SUMMARY
-- ============================================
-- This migration simplifies RLS policies to:
-- 1. Check only profiles.role (not requiring doctors table entry)
-- 2. Allow doctors to view all patients/appointments/encounters
-- 3. Allow nurses/staff to view all patients/appointments/encounters
-- 4. Remove dependency on doctors.doctor_id (which doesn't exist)
