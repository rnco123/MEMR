-- ============================================
-- PATIENT DOCUMENTS TABLE
-- Stores documents uploaded to patient profiles
-- ============================================

CREATE TABLE IF NOT EXISTS public.patient_documents (
  id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  document_label TEXT NOT NULL CHECK (document_label IN ('image', 'report', 'bill', 'prescription', 'lab_result', 'xray', 'other')),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_patient_documents_patient_id ON public.patient_documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_label ON public.patient_documents(document_label);
CREATE INDEX IF NOT EXISTS idx_patient_documents_created_at ON public.patient_documents(created_at DESC);

-- Enable RLS
ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Doctors can view all patient documents
CREATE POLICY "Doctors can view all patient documents"
  ON public.patient_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- Policy: Doctors can insert patient documents
CREATE POLICY "Doctors can insert patient documents"
  ON public.patient_documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- Policy: Doctors can update patient documents
CREATE POLICY "Doctors can update patient documents"
  ON public.patient_documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- Policy: Doctors can delete patient documents
CREATE POLICY "Doctors can delete patient documents"
  ON public.patient_documents
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'doctor'
    )
  );

-- Policy: Nurses can view all patient documents
CREATE POLICY "Nurses can view all patient documents"
  ON public.patient_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Nurses can insert patient documents
CREATE POLICY "Nurses can insert patient documents"
  ON public.patient_documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Nurses can update patient documents
CREATE POLICY "Nurses can update patient documents"
  ON public.patient_documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Policy: Nurses can delete patient documents
CREATE POLICY "Nurses can delete patient documents"
  ON public.patient_documents
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role IN ('nurse', 'staff')
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_patient_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_patient_documents_updated_at
  BEFORE UPDATE ON public.patient_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_patient_documents_updated_at();
