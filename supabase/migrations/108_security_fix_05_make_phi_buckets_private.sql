-- Captured from live database into git for record-keeping.
-- Original applied version: 20260628145827 (2026-06-28) — already applied to STAGING + PRODUCTION.
-- Part of the June 2026 Supabase security-linter remediation batch (fixes 01-10).

-- ============================================================
-- SECURITY FIX 05: Make PHI storage buckets private
-- patient-documents, HIPAACompliance_form, patient_consent_forms,
-- passport-bucket were public — anyone with the file path could
-- download them directly via CDN with no auth check.
-- After this, files require a signed URL generated server-side.
-- ============================================================

UPDATE storage.buckets
SET public = false
WHERE name IN (
  'patient-documents',
  'HIPAACompliance_form',
  'patient_consent_forms',
  'passport-bucket'
);

-- Add read policies for the buckets that previously relied on public access
-- Clinical staff SELECT for HIPAACompliance_form
CREATE POLICY "hipaa_forms_clinical_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'HIPAACompliance_form'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  );

-- Clinical staff SELECT for patient_consent_forms
CREATE POLICY "consent_forms_clinical_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'patient_consent_forms'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  );

-- Clinical staff INSERT for patient_consent_forms
CREATE POLICY "consent_forms_clinical_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'patient_consent_forms'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  );

-- Clinical staff SELECT for passport-bucket
CREATE POLICY "passport_bucket_clinical_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'passport-bucket'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  );

-- Clinical staff INSERT for passport-bucket
CREATE POLICY "passport_bucket_clinical_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'passport-bucket'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  );
