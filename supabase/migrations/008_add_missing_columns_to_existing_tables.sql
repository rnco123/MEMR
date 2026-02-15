-- ============================================
-- ADD MISSING COLUMNS TO EXISTING TABLES
-- Adds columns needed for doctor assignment, tracking, and appointment management
-- ============================================

-- ============================================
-- ENCOUNTERS TABLE
-- Add doctor_id to track which doctor is assigned to each encounter
-- ============================================
ALTER TABLE public.encounters
ADD COLUMN IF NOT EXISTS doctor_id BIGINT REFERENCES public.doctors(id) ON DELETE SET NULL;

-- Create index for faster queries on doctor_id
CREATE INDEX IF NOT EXISTS idx_encounters_doctor_id ON public.encounters(doctor_id);

-- ============================================
-- APPOINTMENTS TABLE
-- Add notes and status fields for appointment management
-- ============================================
-- Add notes field for appointment notes
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add status field for appointment status tracking
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'in_progress'));

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_notes ON public.appointments(notes) WHERE notes IS NOT NULL;

-- ============================================
-- SUMMARY
-- ============================================
-- Added columns:
-- 1. encounters.doctor_id - Links encounters to doctors (BIGINT, references doctors.id)
-- 2. appointments.notes - Stores appointment notes (TEXT)
-- 3. appointments.status - Tracks appointment status (TEXT with CHECK constraint)
--
-- Added indexes:
-- 1. idx_encounters_doctor_id - For faster doctor-based queries
-- 2. idx_appointments_status - For faster status filtering
-- 3. idx_appointments_notes - Partial index for notes (only indexes non-null values)
--
-- All changes use IF NOT EXISTS to safely run multiple times
