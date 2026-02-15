-- ============================================
-- FIX PROFILES RLS FOR CHAT FEATURE
-- Ensures authenticated users can view all profiles for chat
-- ============================================

-- Re-add the policy that allows authenticated users to view all profiles
-- This is needed for the chat feature to list available users

-- Check if policy exists, if not create it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Authenticated users can view profiles'
  ) THEN
    CREATE POLICY "Authenticated users can view profiles"
      ON public.profiles
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Also ensure the policy allows viewing profiles for chat purposes
-- The existing policy should work, but let's make sure it's there
