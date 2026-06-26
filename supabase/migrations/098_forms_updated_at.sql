-- Track last modification time on consent form templates.

ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.forms
SET updated_at = COALESCE(
  NULLIF(content->>'updated_at', '')::timestamptz,
  created_at,
  now()
)
WHERE updated_at IS NULL;

ALTER TABLE public.forms
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.forms
  ALTER COLUMN updated_at SET NOT NULL;

COMMENT ON COLUMN public.forms.updated_at IS 'Last time the form template was created or edited (name, content, or active flag).';
