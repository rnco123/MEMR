-- Allow immigration / I-693 labels on patient_documents (UI + sync)

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
      'other'
    )
  );
