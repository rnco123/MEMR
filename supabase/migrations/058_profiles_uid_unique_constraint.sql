-- Align profiles.id with auth user id when legacy trigger only set uid
UPDATE public.profiles p
SET id = p.uid
WHERE p.uid IS NOT NULL
  AND p.id IS DISTINCT FROM p.uid
  AND NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = p.uid);
