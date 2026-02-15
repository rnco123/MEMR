-- ============================================
-- ADD PERFORMANCE INDEXES
-- Optimizes common query patterns
-- ============================================

-- Appointments indexes
CREATE INDEX IF NOT EXISTS idx_appointments_date 
  ON public.appointments(appointment_date DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_patient 
  ON public.appointments(patient_id);

CREATE INDEX IF NOT EXISTS idx_appointments_location 
  ON public.appointments(location_id);

CREATE INDEX IF NOT EXISTS idx_appointments_service 
  ON public.appointments(service_id);

CREATE INDEX IF NOT EXISTS idx_appointments_date_patient 
  ON public.appointments(appointment_date, patient_id);

-- Encounters indexes
CREATE INDEX IF NOT EXISTS idx_encounters_status 
  ON public.encounters(status);

CREATE INDEX IF NOT EXISTS idx_encounters_doctor 
  ON public.encounters(doctor_id);

CREATE INDEX IF NOT EXISTS idx_encounters_patient 
  ON public.encounters(patient_id);

CREATE INDEX IF NOT EXISTS idx_encounters_appointment 
  ON public.encounters(appointment_id);

CREATE INDEX IF NOT EXISTS idx_encounters_status_doctor 
  ON public.encounters(status, doctor_id);

CREATE INDEX IF NOT EXISTS idx_encounters_created_at 
  ON public.encounters(created_at DESC);

-- Patients indexes
CREATE INDEX IF NOT EXISTS idx_patients_location 
  ON public.patients(location_id);

CREATE INDEX IF NOT EXISTS idx_patients_name 
  ON public.patients(last_name, first_name);

CREATE INDEX IF NOT EXISTS idx_patients_email 
  ON public.patients(email) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_phone 
  ON public.patients(phone) WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_created_at 
  ON public.patients(created_at DESC);

-- Vitals indexes
CREATE INDEX IF NOT EXISTS idx_vitals_encounter 
  ON public.vitals(encounter_id);

CREATE INDEX IF NOT EXISTS idx_vitals_created_at 
  ON public.vitals(created_at DESC);

-- Patient documents indexes
CREATE INDEX IF NOT EXISTS idx_patient_documents_patient 
  ON public.patient_documents(patient_id);

-- Create index on document_label if column exists, otherwise use document_category
DO $$
BEGIN
  -- Check if document_label column exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'patient_documents' 
    AND column_name = 'document_label'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_patient_documents_label 
      ON public.patient_documents(document_label);
  END IF;
  
  -- Check if document_category column exists (alternative name)
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'patient_documents' 
    AND column_name = 'document_category'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_patient_documents_category 
      ON public.patient_documents(document_category);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_patient_documents_created_at 
  ON public.patient_documents(created_at DESC);

-- Intake form indexes
CREATE INDEX IF NOT EXISTS idx_intake_form_appointment 
  ON public.intake_form(appointment_id);

-- Messages indexes (for chat)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
  ON public.messages(conversation_id, created_at DESC);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role_active 
  ON public.profiles(role, active) WHERE active = true;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_appointments_date_status 
  ON public.appointments(appointment_date, status) 
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_encounters_patient_status 
  ON public.encounters(patient_id, status);
