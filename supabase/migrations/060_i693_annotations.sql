-- Lightweight annotation layer storage (separate from structured form_data).
ALTER TABLE public.i693_submissions
ADD COLUMN IF NOT EXISTS annotations JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.i693_submissions.annotations IS 'I-693 lightweight annotation objects (text/cross/image).';
