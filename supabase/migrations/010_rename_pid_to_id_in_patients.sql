-- ============================================
-- RENAME pid TO id IN PATIENTS TABLE
-- This migration updates the patients table to match the new schema
-- ============================================

-- First, check if pid column exists and id doesn't
-- If pid exists, rename it to id
DO $$
BEGIN
  -- Check if pid column exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'patients' 
    AND column_name = 'pid'
  ) THEN
    -- Rename pid to id
    ALTER TABLE public.patients RENAME COLUMN pid TO id;
    
    -- Update the primary key constraint name if needed
    ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_pkey;
    ALTER TABLE public.patients ADD PRIMARY KEY (id);
    
    RAISE NOTICE 'Renamed patients.pid to patients.id';
  ELSIF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'patients' 
    AND column_name = 'id'
  ) THEN
    -- If neither pid nor id exists, create id column
    ALTER TABLE public.patients ADD COLUMN id BIGSERIAL PRIMARY KEY;
    RAISE NOTICE 'Created patients.id column';
  ELSE
    RAISE NOTICE 'patients.id already exists, no changes needed';
  END IF;
END $$;

-- Update any foreign key references from pid to id
-- Check and update appointments table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'appointments' 
    AND column_name = 'pid'
  ) THEN
    ALTER TABLE public.appointments RENAME COLUMN pid TO patient_id;
    RAISE NOTICE 'Renamed appointments.pid to appointments.patient_id';
  END IF;
  
  -- Also check if appointments has appointment_id instead of id
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'appointments' 
    AND column_name = 'appointment_id'
  ) AND NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'appointments' 
    AND column_name = 'id'
  ) THEN
    ALTER TABLE public.appointments RENAME COLUMN appointment_id TO id;
    RAISE NOTICE 'Renamed appointments.appointment_id to appointments.id';
  END IF;
END $$;

-- Check and update encounters table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'encounters' 
    AND column_name = 'pid'
  ) THEN
    ALTER TABLE public.encounters RENAME COLUMN pid TO patient_id;
    RAISE NOTICE 'Renamed encounters.pid to encounters.patient_id';
  END IF;
  
  -- Also check if encounters has eid instead of id
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'encounters' 
    AND column_name = 'eid'
  ) AND NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'encounters' 
    AND column_name = 'id'
  ) THEN
    ALTER TABLE public.encounters RENAME COLUMN eid TO id;
    RAISE NOTICE 'Renamed encounters.eid to encounters.id';
  END IF;
END $$;

-- Check and update patient_file table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'patient_file' 
    AND column_name = 'pid'
  ) THEN
    ALTER TABLE public.patient_file RENAME COLUMN pid TO patient_id;
    RAISE NOTICE 'Renamed patient_file.pid to patient_file.patient_id';
  END IF;
END $$;

-- Check and update patient_documents table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'patient_documents' 
    AND column_name = 'pid'
  ) THEN
    ALTER TABLE public.patient_documents RENAME COLUMN pid TO patient_id;
    RAISE NOTICE 'Renamed patient_documents.pid to patient_documents.patient_id';
  END IF;
END $$;

-- Recreate foreign key constraints if they were dropped
-- This ensures referential integrity is maintained
DO $$
BEGIN
  -- Recreate foreign key for appointments.patient_id -> patients.id
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'appointments' 
    AND constraint_name = 'appointments_patient_id_fkey'
  ) AND EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'appointments' 
    AND column_name = 'patient_id'
  ) THEN
    ALTER TABLE public.appointments 
    ADD CONSTRAINT appointments_patient_id_fkey 
    FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
    RAISE NOTICE 'Created foreign key constraint for appointments.patient_id';
  END IF;
  
  -- Recreate foreign key for encounters.patient_id -> patients.id
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'encounters' 
    AND constraint_name = 'encounters_patient_id_fkey'
  ) AND EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'encounters' 
    AND column_name = 'patient_id'
  ) THEN
    ALTER TABLE public.encounters 
    ADD CONSTRAINT encounters_patient_id_fkey 
    FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
    RAISE NOTICE 'Created foreign key constraint for encounters.patient_id';
  END IF;
  
  -- Recreate foreign key for patient_file.patient_id -> patients.id
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'patient_file' 
    AND constraint_name = 'patient_file_patient_id_fkey'
  ) AND EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'patient_file' 
    AND column_name = 'patient_id'
  ) THEN
    ALTER TABLE public.patient_file 
    ADD CONSTRAINT patient_file_patient_id_fkey 
    FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
    RAISE NOTICE 'Created foreign key constraint for patient_file.patient_id';
  END IF;
  
  -- Recreate foreign key for patient_documents.patient_id -> patients.id
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'patient_documents' 
    AND constraint_name = 'patient_documents_patient_id_fkey'
  ) AND EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'patient_documents' 
    AND column_name = 'patient_id'
  ) THEN
    ALTER TABLE public.patient_documents 
    ADD CONSTRAINT patient_documents_patient_id_fkey 
    FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
    RAISE NOTICE 'Created foreign key constraint for patient_documents.patient_id';
  END IF;
END $$;

-- Update indexes if they reference pid
DO $$
BEGIN
  -- Drop old index on pid if it exists
  IF EXISTS (
    SELECT 1 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'patients' 
    AND indexname = 'idx_patients_pid'
  ) THEN
    DROP INDEX IF EXISTS public.idx_patients_pid;
    RAISE NOTICE 'Dropped old idx_patients_pid index';
  END IF;
  
  -- Create index on id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'patients' 
    AND indexname = 'idx_patients_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_patients_id ON public.patients(id);
    RAISE NOTICE 'Created idx_patients_id index';
  END IF;
END $$;

-- ============================================
-- SUMMARY
-- ============================================
-- This migration:
-- 1. Renames patients.pid to patients.id (if pid exists)
-- 2. Renames related foreign key columns (pid -> patient_id) in:
--    - appointments
--    - encounters
--    - patient_file
--    - patient_documents
-- 3. Recreates foreign key constraints
-- 4. Updates indexes
--
-- After running this migration, the database will match the schema.md structure
