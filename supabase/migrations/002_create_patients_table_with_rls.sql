-- Create patients table with Row Level Security for role-based data isolation
-- This ensures doctors and nurses can only access their assigned patients

-- Create patients table
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  doctor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_nurse_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  medical_record_number TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Policy: Doctors can view all patients
CREATE POLICY "Doctors can view all patients"
  ON public.patients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'doctor'
    )
  );

-- Policy: Doctors can insert patients
CREATE POLICY "Doctors can insert patients"
  ON public.patients
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'doctor'
    )
  );

-- Policy: Doctors can update all patients
CREATE POLICY "Doctors can update all patients"
  ON public.patients
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'doctor'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'doctor'
    )
  );

-- Policy: Doctors can delete patients
CREATE POLICY "Doctors can delete patients"
  ON public.patients
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'doctor'
    )
  );

-- Policy: Nurses can view only assigned patients
CREATE POLICY "Nurses can view assigned patients"
  ON public.patients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'nurse'
      AND patients.assigned_nurse_id = auth.uid()
    )
  );

-- Policy: Nurses can update only assigned patients
CREATE POLICY "Nurses can update assigned patients"
  ON public.patients
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'nurse'
      AND patients.assigned_nurse_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'nurse'
      AND patients.assigned_nurse_id = auth.uid()
    )
  );

-- Policy: Nurses cannot insert or delete patients
-- (No policies needed - default deny)

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_patients_doctor_id ON public.patients(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patients_assigned_nurse_id ON public.patients(assigned_nurse_id);
CREATE INDEX IF NOT EXISTS idx_patients_medical_record_number ON public.patients(medical_record_number);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_patients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on patient updates
CREATE TRIGGER on_patients_updated
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.handle_patients_updated_at();
