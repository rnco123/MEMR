-- ============================================
-- CREATE MISSING TABLES FOR AUTHENTICATION & ROLE MANAGEMENT
-- Based on old migration files and codebase requirements
-- ============================================

-- ============================================
-- PROFILES TABLE
-- Stores user roles and profile information
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

-- Create index for faster role queries
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

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_updated_at();

-- ============================================
-- DOCTORS TABLE
-- Stores doctor-specific information
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

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_doctors_updated_at
  BEFORE UPDATE ON public.doctors
  FOR EACH ROW
  EXECUTE FUNCTION update_doctors_updated_at();

-- ============================================
-- NURSES TABLE
-- Stores nurse-specific information
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

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_nurses_updated_at
  BEFORE UPDATE ON public.nurses
  FOR EACH ROW
  EXECUTE FUNCTION update_nurses_updated_at();

-- ============================================
-- DOCTOR_AVAILABILITY TABLE (if needed for flowboard)
-- Stores doctor availability status
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

-- Create index
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

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_doctor_availability_updated_at
  BEFORE UPDATE ON public.doctor_availability
  FOR EACH ROW
  EXECUTE FUNCTION update_doctor_availability_updated_at();

-- ============================================
-- NOTES
-- ============================================
-- This migration creates the following tables:
-- 1. profiles - User roles and profile info (uid, role, full_name, etc.)
-- 2. doctors - Doctor-specific information (links to auth.users via user_id)
-- 3. nurses - Nurse-specific information (links to auth.users via user_id)
-- 4. doctor_availability - Doctor availability status
--
-- All tables include:
-- - Proper foreign key relationships
-- - Row Level Security (RLS) policies
-- - Indexes for performance
-- - Updated_at triggers
--
-- After running this migration, you may need to:
-- 1. Update RLS policies on patient_documents to reference profiles table
-- 2. Populate profiles table for existing users
-- 3. Create doctor/nurse records for existing users with those roles
