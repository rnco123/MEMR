-- ============================================
-- ALLOW WORD .docx UPLOADS
-- ============================================
-- Upload validation now accepts .docx alongside PDF/PNG/JPEG, but the storage
-- buckets keep their own MIME allowlist: without this, a .docx clears the API
-- and is then rejected by storage. (chat-attachments already allows .docx —
-- see 037_chat_attachments.sql.)

-- Support ticket attachments — allowlist set in 094_support_tickets.sql.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]::text[]
WHERE id = 'support-attachments';

-- Patient chart documents — this bucket was created outside migrations, so only
-- extend its allowlist when it has one (NULL means "any type" already).
UPDATE storage.buckets
SET allowed_mime_types =
  allowed_mime_types
  || ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
WHERE id = 'patient-documents'
  AND allowed_mime_types IS NOT NULL
  AND NOT (
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      = ANY (allowed_mime_types)
  );
