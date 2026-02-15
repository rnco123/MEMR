-- ============================================
-- CREATE PROFILE TRIGGER
-- Automatically creates a profile entry when a user signs up
-- This ensures chat feature works for all users
-- ============================================

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
  user_full_name TEXT;
BEGIN
  -- Get role from user metadata, default to 'staff' if not specified
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'staff');
  
  -- Ensure role is valid (doctor, nurse, or staff)
  IF user_role NOT IN ('doctor', 'nurse', 'staff') THEN
    user_role := 'staff';
  END IF;
  
  -- Get full name from metadata
  user_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.email
  );
  
  -- Insert into profiles table (ignore if already exists)
  INSERT INTO public.profiles (uid, role, full_name, email, active)
  VALUES (
    NEW.id,
    user_role,
    user_full_name,
    NEW.email,
    true
  )
  ON CONFLICT (uid) DO UPDATE
  SET 
    role = COALESCE(EXCLUDED.role, profiles.role),
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    email = COALESCE(EXCLUDED.email, profiles.email),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;

-- Create trigger to call the function on new user creation
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- ============================================
-- BACKFILL EXISTING USERS
-- Creates profiles for users that don't have them yet
-- ============================================

-- Insert profiles for existing auth users that don't have profiles
INSERT INTO public.profiles (uid, role, full_name, email, active)
SELECT 
  au.id,
  COALESCE(
    au.raw_user_meta_data->>'role',
    CASE 
      WHEN EXISTS (SELECT 1 FROM public.doctors WHERE user_id = au.id) THEN 'doctor'
      WHEN EXISTS (SELECT 1 FROM public.nurses WHERE user_id = au.id) THEN 'nurse'
      ELSE 'staff'
    END,
    'staff'
  )::TEXT,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    au.email
  ),
  au.email,
  true
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE uid = au.id
)
ON CONFLICT (uid) DO NOTHING;
