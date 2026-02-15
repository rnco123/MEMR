-- ============================================
-- ADD MISSING COLUMNS TO PATIENT_DOCUMENTS
-- Adds columns that the UI expects but are missing from the schema
-- ============================================

-- Add document_name column if it doesn't exist
ALTER TABLE public.patient_documents
ADD COLUMN IF NOT EXISTS document_name TEXT;

-- Add document_label column if it doesn't exist (as alias for document_category)
-- We'll keep both for compatibility
ALTER TABLE public.patient_documents
ADD COLUMN IF NOT EXISTS document_label TEXT CHECK (document_label IN ('image', 'report', 'bill', 'prescription', 'lab_result', 'xray', 'other'));

-- Add file_url column if it doesn't exist (for storing the full public URL)
ALTER TABLE public.patient_documents
ADD COLUMN IF NOT EXISTS file_url TEXT;

-- Add uploaded_by_name column if it doesn't exist
ALTER TABLE public.patient_documents
ADD COLUMN IF NOT EXISTS uploaded_by_name TEXT;

-- Create a trigger to sync document_label with document_category
-- This ensures both columns stay in sync
CREATE OR REPLACE FUNCTION sync_document_label_category()
RETURNS TRIGGER AS $$
BEGIN
  -- If document_label is set but document_category is not, sync it
  IF NEW.document_label IS NOT NULL AND (NEW.document_category IS NULL OR NEW.document_category = '') THEN
    NEW.document_category := NEW.document_label;
  END IF;
  
  -- If document_category is set but document_label is not, sync it
  IF NEW.document_category IS NOT NULL AND (NEW.document_label IS NULL OR NEW.document_label = '') THEN
    NEW.document_label := NEW.document_category;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync columns
DROP TRIGGER IF EXISTS sync_document_label_category_trigger ON public.patient_documents;
CREATE TRIGGER sync_document_label_category_trigger
  BEFORE INSERT OR UPDATE ON public.patient_documents
  FOR EACH ROW
  EXECUTE FUNCTION sync_document_label_category();

-- Update existing rows to sync document_category to document_label if needed
UPDATE public.patient_documents
SET document_label = document_category
WHERE document_category IS NOT NULL 
  AND (document_label IS NULL OR document_label = '');

-- ============================================
-- SUMMARY
-- ============================================
-- This migration adds:
-- 1. document_name - For storing custom document names
-- 2. document_label - Alias for document_category (for UI compatibility)
-- 3. file_url - For storing full public URLs
-- 4. uploaded_by_name - For storing uploader's name
--
-- A trigger ensures document_label and document_category stay in sync
