-- Staff ↔ clinic location assignments (many-to-many)
-- Supports legacy profile_id rows and auth user_uid.

CREATE TABLE IF NOT EXISTS public.user_locations (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID,
  user_uid UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_locations ADD COLUMN IF NOT EXISTS user_uid UUID REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.user_locations ul
SET user_uid = ul.profile_id
WHERE ul.user_uid IS NULL AND ul.profile_id IS NOT NULL;

UPDATE public.user_locations ul
SET user_uid = p.uid
FROM public.profiles p
WHERE ul.user_uid IS NULL
  AND ul.profile_id IS NOT NULL
  AND (p.id = ul.profile_id OR p.uid = ul.profile_id);

DELETE FROM public.user_locations WHERE user_uid IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_locations_user_uid_location_id_key
  ON public.user_locations (user_uid, location_id);

CREATE INDEX IF NOT EXISTS idx_user_locations_user_uid ON public.user_locations(user_uid);
CREATE INDEX IF NOT EXISTS idx_user_locations_location_id ON public.user_locations(location_id);

INSERT INTO public.user_locations (user_uid, location_id)
SELECT d.user_id, d.location_id
FROM public.doctors d
WHERE d.location_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_locations ul
    WHERE ul.user_uid = d.user_id AND ul.location_id = d.location_id
  );

INSERT INTO public.user_locations (user_uid, location_id)
SELECT n.user_id, n.location_id
FROM public.nurses n
WHERE n.location_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_locations ul
    WHERE ul.user_uid = n.user_id AND ul.location_id = n.location_id
  );

ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own location assignments" ON public.user_locations;
CREATE POLICY "Users read own location assignments"
  ON public.user_locations
  FOR SELECT
  USING (auth.uid() = user_uid);

DROP POLICY IF EXISTS "Admins manage user_locations" ON public.user_locations;
CREATE POLICY "Admins manage user_locations"
  ON public.user_locations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.uid = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.uid = auth.uid() AND p.role = 'admin'
    )
  );
