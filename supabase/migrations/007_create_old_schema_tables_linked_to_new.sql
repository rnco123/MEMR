-- ============================================
-- CREATE OLD SCHEMA TABLES - LINKED TO NEW SCHEMA
-- Creates tables from old structure that link to existing new schema tables
-- DOES NOT ALTER existing tables - only creates new ones
-- ============================================

-- ============================================
-- PROFILES TABLE
-- User roles and profile information
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  uid UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('doctor', 'nurse', 'staff')),
  full_name TEXT,
  email TEXT,
  profile_pictures TEXT DEFAULT '',
  fcm_token TEXT,
  notify BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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

-- Policy: Authenticated users can view all profiles (for role checks)
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_uid ON public.profiles(uid);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_updated_at();

-- ============================================
-- DOCTORS TABLE
-- Doctor-specific information
-- Links to profiles.uid via user_id
-- ============================================
CREATE TABLE IF NOT EXISTS public.doctors (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES public.locations(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  specialty TEXT,
  availability JSONB,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own doctor profile
CREATE POLICY "Users can view own doctor profile"
  ON public.doctors
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own doctor profile
CREATE POLICY "Users can insert own doctor profile"
  ON public.doctors
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own doctor profile
CREATE POLICY "Users can update own doctor profile"
  ON public.doctors
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Authenticated users can view all doctor profiles
CREATE POLICY "Authenticated users can view all doctors"
  ON public.doctors
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_doctors_user_id ON public.doctors(user_id);
CREATE INDEX IF NOT EXISTS idx_doctors_location_id ON public.doctors(location_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_doctors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_doctors_updated_at
  BEFORE UPDATE ON public.doctors
  FOR EACH ROW
  EXECUTE FUNCTION update_doctors_updated_at();

-- ============================================
-- NURSES TABLE
-- Nurse-specific information
-- Links to profiles.uid via user_id
-- ============================================
CREATE TABLE IF NOT EXISTS public.nurses (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES public.locations(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.nurses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own nurse profile
CREATE POLICY "Users can view own nurse profile"
  ON public.nurses
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own nurse profile
CREATE POLICY "Users can insert own nurse profile"
  ON public.nurses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own nurse profile
CREATE POLICY "Users can update own nurse profile"
  ON public.nurses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Authenticated users can view all nurse profiles
CREATE POLICY "Authenticated users can view all nurses"
  ON public.nurses
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_nurses_user_id ON public.nurses(user_id);
CREATE INDEX IF NOT EXISTS idx_nurses_location_id ON public.nurses(location_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_nurses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_nurses_updated_at
  BEFORE UPDATE ON public.nurses
  FOR EACH ROW
  EXECUTE FUNCTION update_nurses_updated_at();

-- ============================================
-- DOCTOR_AVAILABILITY TABLE
-- Tracks doctor availability status
-- Links to doctors.id
-- ============================================
CREATE TABLE IF NOT EXISTS public.doctor_availability (
  id BIGSERIAL PRIMARY KEY,
  doctor_id BIGINT NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  is_available BOOLEAN DEFAULT false NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(doctor_id)
);

-- Enable RLS
ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;

-- Policy: Doctors can manage their own availability
CREATE POLICY "Doctors can manage own availability"
  ON public.doctor_availability
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.doctors
      WHERE doctors.id = doctor_availability.doctor_id
      AND doctors.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doctors
      WHERE doctors.id = doctor_availability.doctor_id
      AND doctors.user_id = auth.uid()
    )
  );

-- Policy: Authenticated users can view availability
CREATE POLICY "Authenticated users can view availability"
  ON public.doctor_availability
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_doctor_availability_doctor_id ON public.doctor_availability(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_availability_is_available ON public.doctor_availability(is_available);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_doctor_availability_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_doctor_availability_updated_at
  BEFORE UPDATE ON public.doctor_availability
  FOR EACH ROW
  EXECUTE FUNCTION update_doctor_availability_updated_at();

-- ============================================
-- APPOINTMENT_ROOMS TABLE
-- Links appointments to Daily.co video rooms
-- Links to appointments.id (NEW SCHEMA)
-- ============================================
CREATE TABLE IF NOT EXISTS public.appointment_rooms (
  id BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  daily_room_name TEXT NOT NULL,
  daily_room_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(appointment_id)
);

-- Enable RLS
ALTER TABLE public.appointment_rooms ENABLE ROW LEVEL SECURITY;

-- Policy: Nurses/Staff can view ALL appointment rooms
CREATE POLICY "Nurses can view all appointment rooms"
  ON public.appointment_rooms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
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
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
      AND EXISTS (
        SELECT 1 FROM public.doctors
        WHERE doctors.user_id = profiles.uid
        AND EXISTS (
          SELECT 1 FROM public.encounters e
          WHERE e.appointment_id = appointment_rooms.appointment_id
          -- Note: encounters table doesn't have doctor_id in new schema
          -- This policy may need adjustment when doctor assignment is implemented
        )
      )
    )
  );

-- Policy: Authenticated users can insert/update appointment rooms
CREATE POLICY "Authenticated users can manage appointment rooms"
  ON public.appointment_rooms
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_appointment_rooms_appointment_id ON public.appointment_rooms(appointment_id);

-- ============================================
-- PATIENT_FILE TABLE
-- Patient file/record information
-- Links to encounters.id and patients.id (NEW SCHEMA)
-- ============================================
CREATE TABLE IF NOT EXISTS public.patient_file (
  id BIGSERIAL PRIMARY KEY,
  encounter_id BIGINT NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  file_data JSONB,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.patient_file ENABLE ROW LEVEL SECURITY;

-- Policy: Doctors can view all patient files
CREATE POLICY "Doctors can view all patient files"
  ON public.patient_file
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- Policy: Nurses can view all patient files
CREATE POLICY "Nurses can view all patient files"
  ON public.patient_file
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Doctors can manage patient files
CREATE POLICY "Doctors can manage patient files"
  ON public.patient_file
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_patient_file_encounter_id ON public.patient_file(encounter_id);
CREATE INDEX IF NOT EXISTS idx_patient_file_patient_id ON public.patient_file(patient_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_patient_file_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_patient_file_updated_at
  BEFORE UPDATE ON public.patient_file
  FOR EACH ROW
  EXECUTE FUNCTION update_patient_file_updated_at();

-- ============================================
-- TREATMENT_TYPES TABLE (if needed)
-- Stores treatment type definitions
-- ============================================
CREATE TABLE IF NOT EXISTS public.treatment_types (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.treatment_types ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view treatment types
CREATE POLICY "Authenticated users can view treatment types"
  ON public.treatment_types
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Doctors can manage treatment types
CREATE POLICY "Doctors can manage treatment types"
  ON public.treatment_types
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_treatment_types_name ON public.treatment_types(name);
CREATE INDEX IF NOT EXISTS idx_treatment_types_is_active ON public.treatment_types(is_active);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_treatment_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_treatment_types_updated_at
  BEFORE UPDATE ON public.treatment_types
  FOR EACH ROW
  EXECUTE FUNCTION update_treatment_types_updated_at();

-- ============================================
-- SUMMARY
-- ============================================
-- Created tables:
-- 1. profiles - User roles (uid, role, full_name, etc.)
-- 2. doctors - Doctor info (links to auth.users via user_id, links to locations)
-- 3. nurses - Nurse info (links to auth.users via user_id, links to locations)
-- 4. doctor_availability - Doctor availability status (links to doctors.id)
-- 5. appointment_rooms - Video room links (links to appointments.id)
-- 6. patient_file - Patient file records (links to encounters.id and patients.id)
-- 7. treatment_types - Treatment type definitions
--
-- All tables:
-- - Link to NEW schema tables using correct field names (id, not pid/appointment_id)
-- - Use BIGINT for IDs matching new schema
-- - Include RLS policies
-- - Include indexes for performance
-- - Include updated_at triggers
-- - DO NOT alter any existing tables
