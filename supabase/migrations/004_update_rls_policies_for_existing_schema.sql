-- ============================================
-- RLS POLICIES FOR EXISTING SUPABASE SCHEMA
-- This migration updates RLS policies to match your existing database structure
-- ============================================

-- ============================================
-- PROFILES TABLE
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Policy: Users can view their own profile
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
-- PATIENTS TABLE
-- ============================================
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Doctors can view all patients" ON public.patients;
DROP POLICY IF EXISTS "Doctors can manage patients" ON public.patients;
DROP POLICY IF EXISTS "Nurses can view assigned patients" ON public.patients;
DROP POLICY IF EXISTS "Nurses can view all patients" ON public.patients;

-- Policy: Nurses/Staff can view ALL patients
CREATE POLICY "Nurses can view all patients"
  ON public.patients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Doctors can view all patients (for patient history access)
CREATE POLICY "Doctors can view all patients"
  ON public.patients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM doctors
        WHERE doctors.doctor_id = profiles.uid
      )
    )
  );

-- Policy: Doctors can insert/update/delete patients
CREATE POLICY "Doctors can manage patients"
  ON public.patients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM doctors
        WHERE doctors.doctor_id = profiles.uid
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM doctors
        WHERE doctors.doctor_id = profiles.uid
      )
    )
  );

-- ============================================
-- APPOINTMENTS TABLE
-- ============================================
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
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
      SELECT 1 FROM profiles
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
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Doctors can only view appointments assigned to them
-- (Appointments are assigned via encounters.doctor_id)
CREATE POLICY "Doctors can view assigned appointments"
  ON public.appointments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM doctors
        WHERE doctors.doctor_id = profiles.uid
        AND EXISTS (
          SELECT 1 FROM encounters e
          WHERE e.appointment_id = appointments.appointment_id
          AND e.doctor_id = profiles.uid
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
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM doctors
        WHERE doctors.doctor_id = profiles.uid
        AND EXISTS (
          SELECT 1 FROM encounters e
          WHERE e.appointment_id = appointments.appointment_id
          AND e.doctor_id = profiles.uid
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM doctors
        WHERE doctors.doctor_id = profiles.uid
        AND EXISTS (
          SELECT 1 FROM encounters e
          WHERE e.appointment_id = appointments.appointment_id
          AND e.doctor_id = profiles.uid
        )
      )
    )
  );

-- ============================================
-- ENCOUNTERS TABLE
-- ============================================
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Doctors can view own encounters" ON public.encounters;
DROP POLICY IF EXISTS "Doctors can manage own encounters" ON public.encounters;
DROP POLICY IF EXISTS "Nurses can view assigned encounters" ON public.encounters;
DROP POLICY IF EXISTS "Doctors can view all encounters" ON public.encounters;
DROP POLICY IF EXISTS "Nurses can view all encounters" ON public.encounters;

-- Policy: Both Doctors and Nurses can view ALL encounters (full patient history)
CREATE POLICY "Doctors can view all encounters"
  ON public.encounters
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM doctors
        WHERE doctors.doctor_id = profiles.uid
      )
    )
  );

-- Policy: Nurses/Staff can view ALL encounters (full patient history)
CREATE POLICY "Nurses can view all encounters"
  ON public.encounters
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Doctors can manage their own encounters
CREATE POLICY "Doctors can manage own encounters"
  ON public.encounters
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND encounters.doctor_id = profiles.uid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND encounters.doctor_id = profiles.uid
    )
  );

-- ============================================
-- INTAKE_FORMS TABLE
-- ============================================
ALTER TABLE public.intake_forms ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Doctors can view intake forms for own encounters" ON public.intake_forms;
DROP POLICY IF EXISTS "Doctors can manage intake forms for own encounters" ON public.intake_forms;
DROP POLICY IF EXISTS "Nurses can view assigned intake forms" ON public.intake_forms;
DROP POLICY IF EXISTS "Doctors can view all intake forms" ON public.intake_forms;
DROP POLICY IF EXISTS "Nurses can view all intake forms" ON public.intake_forms;

-- Policy: Both Doctors and Nurses can view ALL intake forms (full patient history)
CREATE POLICY "Doctors can view all intake forms"
  ON public.intake_forms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM doctors
        WHERE doctors.doctor_id = profiles.uid
      )
    )
  );

-- Policy: Nurses/Staff can view ALL intake forms (full patient history)
CREATE POLICY "Nurses can view all intake forms"
  ON public.intake_forms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Doctors can manage intake forms for their encounters
CREATE POLICY "Doctors can manage intake forms for own encounters"
  ON public.intake_forms
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM encounters e
        WHERE e.eid = intake_forms.encounter_id
        AND e.doctor_id = profiles.uid
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM encounters e
        WHERE e.eid = intake_forms.encounter_id
        AND e.doctor_id = profiles.uid
      )
    )
  );

-- ============================================
-- PATIENT_FILE TABLE
-- ============================================
ALTER TABLE public.patient_file ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Doctors can view patient files for own encounters" ON public.patient_file;
DROP POLICY IF EXISTS "Doctors can manage patient files for own encounters" ON public.patient_file;
DROP POLICY IF EXISTS "Nurses can view assigned patient files" ON public.patient_file;
DROP POLICY IF EXISTS "Doctors can view all patient files" ON public.patient_file;
DROP POLICY IF EXISTS "Nurses can view all patient files" ON public.patient_file;

-- Policy: Both Doctors and Nurses can view ALL patient files (full patient history)
CREATE POLICY "Doctors can view all patient files"
  ON public.patient_file
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM doctors
        WHERE doctors.doctor_id = profiles.uid
      )
    )
  );

-- Policy: Nurses/Staff can view ALL patient files (full patient history)
CREATE POLICY "Nurses can view all patient files"
  ON public.patient_file
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Doctors can manage patient files for their encounters
CREATE POLICY "Doctors can manage patient files for own encounters"
  ON public.patient_file
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM encounters e
        WHERE e.eid = patient_file.encounter_id
        AND e.doctor_id = profiles.uid
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM encounters e
        WHERE e.eid = patient_file.encounter_id
        AND e.doctor_id = profiles.uid
      )
    )
  );

-- ============================================
-- APPOINTMENT_ROOMS TABLE
-- ============================================
ALTER TABLE public.appointment_rooms ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Doctors can view appointment rooms" ON public.appointment_rooms;
DROP POLICY IF EXISTS "Nurses can view assigned appointment rooms" ON public.appointment_rooms;
DROP POLICY IF EXISTS "Nurses can view all appointment rooms" ON public.appointment_rooms;
DROP POLICY IF EXISTS "Doctors can view assigned appointment rooms" ON public.appointment_rooms;

-- Policy: Nurses/Staff can view ALL appointment rooms
CREATE POLICY "Nurses can view all appointment rooms"
  ON public.appointment_rooms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Doctors can view rooms for appointments assigned to them
CREATE POLICY "Doctors can view assigned appointment rooms"
  ON public.appointment_rooms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM doctors
        WHERE doctors.doctor_id = profiles.uid
        AND EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.appointment_id = appointment_rooms.appointment_id
          AND EXISTS (
            SELECT 1 FROM encounters e
            WHERE e.appointment_id = a.appointment_id
            AND e.doctor_id = profiles.uid
          )
        )
      )
    )
  );

-- ============================================
-- DOCTORS TABLE
-- ============================================
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own doctor profile" ON public.doctors;
DROP POLICY IF EXISTS "Users can insert own doctor profile" ON public.doctors;
DROP POLICY IF EXISTS "Users can update own doctor profile" ON public.doctors;
DROP POLICY IF EXISTS "Doctors can view all doctor profiles" ON public.doctors;

-- Policy: Users can view their own doctor profile
CREATE POLICY "Users can view own doctor profile"
  ON public.doctors
  FOR SELECT
  USING (doctor_id = auth.uid());

-- Policy: Users can insert their own doctor profile
CREATE POLICY "Users can insert own doctor profile"
  ON public.doctors
  FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

-- Policy: Users can update their own doctor profile
CREATE POLICY "Users can update own doctor profile"
  ON public.doctors
  FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Policy: Doctors can view all doctor profiles
CREATE POLICY "Doctors can view all doctor profiles"
  ON public.doctors
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- ============================================
-- DOCTOR_AVAILABILITY TABLE
-- ============================================
ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Doctors can view own availability" ON public.doctor_availability;
DROP POLICY IF EXISTS "Doctors can manage own availability" ON public.doctor_availability;

-- Policy: Doctors can view their own availability
CREATE POLICY "Doctors can view own availability"
  ON public.doctor_availability
  FOR SELECT
  USING (doctor_id = auth.uid());

-- Policy: Doctors can manage their own availability
CREATE POLICY "Doctors can manage own availability"
  ON public.doctor_availability
  FOR ALL
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- ============================================
-- NOTES
-- ============================================
-- This migration sets up RLS policies based on your existing schema:
-- - profiles.uid references auth.users(id)
-- - doctors.doctor_id references profiles.uid
-- - appointments.pid references patients.pid
-- - encounters.doctor_id references doctors.doctor_id
-- - encounters.appointment_id references appointments.appointment_id
-- - intake_forms.encounter_id references encounters.eid
-- - patient_file.encounter_id references encounters.eid
-- - patient_file.pid references patients.pid
-- - appointment_rooms.appointment_id references appointments.appointment_id
-- - doctor_availability.doctor_id references doctors.doctor_id
--
-- The policies ensure:
-- 1. Nurses/Staff can view ALL patients, appointments, and full patient history
-- 2. Doctors can only view appointments assigned to them (via encounters.doctor_id)
-- 3. Both Doctors and Nurses can view ALL encounters and patient history (full access)
-- 4. Doctors can manage their own encounters and related data
-- 5. Users can only view/update their own profile
