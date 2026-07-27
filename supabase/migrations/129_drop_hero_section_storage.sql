-- Drop legacy Hero_section public storage bucket (legacy CMS; not used by MEMR).
-- Live bucket id confirmed on MEMR Supabase: Hero_section (public, 0 objects).
-- Alternate ids included defensively: hero-section, hero_section.
--
-- Bucket delete requires an empty bucket — remove storage.objects rows first
-- (Supabase does not CASCADE object deletion when deleting storage.buckets).

-- ── storage.objects policies ──────────────────────────────────
DROP POLICY IF EXISTS "Hero_section public read" ON storage.objects;

-- Defensive: drop any other storage.objects policies scoped to these bucket ids
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        qual ILIKE '%Hero_section%'
        OR qual ILIKE '%hero-section%'
        OR qual ILIKE '%hero_section%'
        OR with_check ILIKE '%Hero_section%'
        OR with_check ILIKE '%hero-section%'
        OR with_check ILIKE '%hero_section%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- ── bucket + objects ──────────────────────────────────────────
-- Supabase blocks direct storage DELETE unless this session flag is set.
SET LOCAL storage.allow_delete_query = 'true';

DELETE FROM storage.objects
WHERE bucket_id IN ('Hero_section', 'hero-section', 'hero_section');

DELETE FROM storage.buckets
WHERE id IN ('Hero_section', 'hero-section', 'hero_section');
