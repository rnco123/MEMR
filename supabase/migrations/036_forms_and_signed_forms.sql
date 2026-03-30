-- Form templates (HTML in content.jsonb) and per-encounter signature paths (patient_consent_forms bucket)

CREATE TABLE IF NOT EXISTS public.forms (
  id bigint generated always as identity not null,
  name text not null,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  content jsonb null,
  constraint forms_pkey primary key (id)
);

COMMENT ON TABLE public.forms IS 'Consent / legal form templates; content.html with {{PATIENT_NAME}}, {{DATE}}, {{PATIENT_/_GUARDIAN_SIGNATURE}}, {{PHYSICIAN_SIGNATURE}} placeholders.';

CREATE TABLE IF NOT EXISTS public.signed_forms (
  id serial not null,
  encounter_id integer null,
  form_paths text not null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint signed_forms_pkey primary key (id),
  constraint signed_forms_encounter_id_unique unique (encounter_id),
  constraint signed_forms_encounter_id_fkey foreign key (encounter_id) references public.encounters (id) on delete cascade
);

COMMENT ON TABLE public.signed_forms IS 'Storage paths (JSON or plain) under bucket patient_consent_forms for signatures per encounter.';
COMMENT ON COLUMN public.signed_forms.form_paths IS 'JSON array of paths, or JSON object {patient, physician}, or single path string relative to encounter folder.';

ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signed_forms ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active form templates
DROP POLICY IF EXISTS "forms_select_authenticated" ON public.forms;
CREATE POLICY "forms_select_authenticated"
  ON public.forms FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can read signed_forms (paths are not secrets; files are in public bucket or signed URLs from API)
DROP POLICY IF EXISTS "signed_forms_select_authenticated" ON public.signed_forms;
CREATE POLICY "signed_forms_select_authenticated"
  ON public.signed_forms FOR SELECT
  TO authenticated
  USING (true);

-- Service role / migrations may insert; app can use service role for writes
DROP POLICY IF EXISTS "forms_insert_service" ON public.forms;
CREATE POLICY "forms_insert_service"
  ON public.forms FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "forms_update_service" ON public.forms;
CREATE POLICY "forms_update_service"
  ON public.forms FOR UPDATE
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "signed_forms_all_service" ON public.signed_forms;
CREATE POLICY "signed_forms_all_service"
  ON public.signed_forms FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
