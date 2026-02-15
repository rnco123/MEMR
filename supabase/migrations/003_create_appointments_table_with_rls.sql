-- Create appointments table with Row Level Security for role-based access
-- Doctors can manage all appointments, nurses can only view/update assigned patient appointments

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  doctor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  appointment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  appointment_type TEXT,
  notes TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Policy: Doctors can view all appointments
CREATE POLICY "Doctors can view all appointments"
  ON public.appointments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'doctor'
    )
  );

-- Policy: Doctors can create appointments
CREATE POLICY "Doctors can create appointments"
  ON public.appointments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'doctor'
    )
  );

-- Policy: Doctors can update all appointments
CREATE POLICY "Doctors can update all appointments"
  ON public.appointments
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

-- Policy: Doctors can delete appointments
CREATE POLICY "Doctors can delete appointments"
  ON public.appointments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'doctor'
    )
  );

-- Policy: Nurses can view appointments for assigned patients
CREATE POLICY "Nurses can view assigned patient appointments"
  ON public.appointments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'nurse'
      AND EXISTS (
        SELECT 1 FROM public.patients
        WHERE patients.id = appointments.patient_id
        AND patients.assigned_nurse_id = auth.uid()
      )
    )
  );

-- Policy: Nurses can create appointments for assigned patients
CREATE POLICY "Nurses can create appointments for assigned patients"
  ON public.appointments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'nurse'
      AND EXISTS (
        SELECT 1 FROM public.patients
        WHERE patients.id = appointments.patient_id
        AND patients.assigned_nurse_id = auth.uid()
      )
    )
  );

-- Policy: Nurses can update appointments for assigned patients
CREATE POLICY "Nurses can update assigned patient appointments"
  ON public.appointments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'nurse'
      AND EXISTS (
        SELECT 1 FROM public.patients
        WHERE patients.id = appointments.patient_id
        AND patients.assigned_nurse_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'nurse'
      AND EXISTS (
        SELECT 1 FROM public.patients
        WHERE patients.id = appointments.patient_id
        AND patients.assigned_nurse_id = auth.uid()
      )
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON public.appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

-- Create trigger to update updated_at
CREATE TRIGGER on_appointments_updated
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
