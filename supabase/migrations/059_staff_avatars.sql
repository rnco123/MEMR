-- Preset staff avatars: profiles.avatar_id + public storage bucket

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_id TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_id_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_id_check
  CHECK (
    avatar_id IS NULL
    OR avatar_id IN (
      'hw-male-doctor',
      'hw-male-nurse',
      'hw-male-medic',
      'hw-female-doctor',
      'hw-female-nurse',
      'hw-female-surgeon'
    )
  );

COMMENT ON COLUMN public.profiles.avatar_id IS 'Preset staff avatar key (staff-avatars bucket / public/avatars fallback)';

-- Storage bucket (public read for preset images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-avatars',
  'staff-avatars',
  true,
  1048576,
  ARRAY['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Anyone can view staff avatars" ON storage.objects;
DROP POLICY IF EXISTS "Service role manages staff avatars" ON storage.objects;

CREATE POLICY "Anyone can view staff avatars"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'staff-avatars');

-- Seed uploads use service role (bypasses RLS). No user uploads to this bucket.

CREATE INDEX IF NOT EXISTS idx_profiles_avatar_id ON public.profiles(avatar_id)
  WHERE avatar_id IS NOT NULL;
