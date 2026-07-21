-- Future appointments document folder (stored in document_category).
-- Live schema uses document_category; app maps it as document_label in the API.

ALTER TABLE public.patient_documents
  DROP CONSTRAINT IF EXISTS patient_documents_document_category_check;

ALTER TABLE public.patient_documents
  ADD CONSTRAINT patient_documents_document_category_check
  CHECK (
    document_category IS NULL
    OR document_category IN (
      'image',
      'report',
      'bill',
      'prescription',
      'lab_result',
      'xray',
      'immigration',
      'i693',
      'id_document',
      'previous_medical_records',
      'imaging',
      'future_appointments',
      'other'
    )
  );
