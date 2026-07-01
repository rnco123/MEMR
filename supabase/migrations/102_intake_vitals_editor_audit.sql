-- Track last editor on intake and vitals rows (encounter modal audit footer).

ALTER TABLE public.intake_form
  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS editor_role text,
  ADD COLUMN IF NOT EXISTS editor_name text;

ALTER TABLE public.vitals
  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS editor_role text,
  ADD COLUMN IF NOT EXISTS editor_name text;

COMMENT ON COLUMN public.intake_form.edited_by IS 'Auth user id of staff who last saved intake from MEMR.';
COMMENT ON COLUMN public.vitals.edited_by IS 'Auth user id of staff who last saved vitals from MEMR.';
