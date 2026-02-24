-- ============================================
-- FIX PROFILES TABLE SCHEMA COMPATIBILITY
-- Ensures role column exists (production uses profiles.id, not profiles.uid)
-- Fixes 400 Bad Request / error 42703 (undefined column) on login
-- ============================================

-- Add role column if it doesn't exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'nurse';
    UPDATE public.profiles SET role = 'nurse' WHERE role IS NULL;
    ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
      CHECK (role IN ('doctor', 'nurse', 'staff'));
    CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
  END IF;
END $$;
