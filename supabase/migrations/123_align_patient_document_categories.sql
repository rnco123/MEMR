-- Keep the database constraint aligned with PATIENT_DOCUMENT_LABELS used by
-- both the patient chart and flowboard registration upload interfaces.

ALTER TABLE public.patient_documents
  DROP CONSTRAINT IF EXISTS patient_documents_document_label_check;

ALTER TABLE public.patient_documents
  ADD CONSTRAINT patient_documents_document_label_check
  CHECK (
    document_label IS NULL
    OR document_label IN (
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
      'other'
    )
  );
