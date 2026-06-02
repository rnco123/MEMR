-- Set admin display name for sidebar/header (profiles.full_name)

UPDATE public.profiles
SET
  full_name = 'Mack Martinez',
  updated_at = NOW()
WHERE email ILIKE 'admin@myclinicmd.com'
   OR (
     role = 'admin'
     AND (full_name IS NULL OR TRIM(full_name) = '' OR full_name ILIKE 'admin')
   );

-- Keep Supabase Auth metadata in sync for faster client reads
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('full_name', 'Mack Martinez', 'name', 'Mack Martinez')
WHERE email ILIKE 'admin@myclinicmd.com';
