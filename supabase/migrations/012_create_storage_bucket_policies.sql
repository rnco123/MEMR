-- ============================================
-- STORAGE BUCKET POLICIES FOR PATIENT DOCUMENTS
-- This migration creates RLS policies for the patient-documents storage bucket
-- ============================================

-- Note: The bucket must be created manually in Supabase Dashboard first:
-- 1. Go to Storage → Create bucket
-- 2. Name: patient-documents
-- 3. Public: Yes (for public file access via URLs)
-- 4. File size limit: 50MB (or your preferred limit)

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;

-- Policy: Authenticated users (doctors/nurses/staff) can upload files to patient-documents bucket
CREATE POLICY "Authenticated users can upload documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'patient-documents'
    AND (
      -- Allow if user is a doctor
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.uid = auth.uid()
        AND profiles.role = 'doctor'
      )
      OR
      -- Allow if user is a nurse or staff
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.uid = auth.uid()
        AND profiles.role IN ('nurse', 'staff')
      )
    )
  );

-- Policy: Authenticated users can view files in patient-documents bucket
CREATE POLICY "Authenticated users can view documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'patient-documents'
    AND (
      -- Allow if user is a doctor
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.uid = auth.uid()
        AND profiles.role = 'doctor'
      )
      OR
      -- Allow if user is a nurse or staff
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.uid = auth.uid()
        AND profiles.role IN ('nurse', 'staff')
      )
    )
  );

-- Policy: Authenticated users can delete files from patient-documents bucket
CREATE POLICY "Authenticated users can delete documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'patient-documents'
    AND (
      -- Allow if user is a doctor
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.uid = auth.uid()
        AND profiles.role = 'doctor'
      )
      OR
      -- Allow if user is a nurse or staff
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.uid = auth.uid()
        AND profiles.role IN ('nurse', 'staff')
      )
    )
  );

-- Policy: Authenticated users can update files in patient-documents bucket
CREATE POLICY "Authenticated users can update documents"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'patient-documents'
    AND (
      -- Allow if user is a doctor
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.uid = auth.uid()
        AND profiles.role = 'doctor'
      )
      OR
      -- Allow if user is a nurse or staff
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.uid = auth.uid()
        AND profiles.role IN ('nurse', 'staff')
      )
    )
  )
  WITH CHECK (
    bucket_id = 'patient-documents'
    AND (
      -- Allow if user is a doctor
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.uid = auth.uid()
        AND profiles.role = 'doctor'
      )
      OR
      -- Allow if user is a nurse or staff
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.uid = auth.uid()
        AND profiles.role IN ('nurse', 'staff')
      )
    )
  );

-- ============================================
-- SUMMARY
-- ============================================
-- This migration creates storage bucket policies that allow:
-- 1. Doctors, nurses, and staff to upload files
-- 2. Doctors, nurses, and staff to view files
-- 3. Doctors, nurses, and staff to delete files
-- 4. Doctors, nurses, and staff to update files
--
-- All policies check the user's role from the profiles table
-- and only apply to the 'patient-documents' bucket
