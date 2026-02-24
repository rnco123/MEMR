-- ============================================
-- SIGNED_FORM TABLE
-- Stores storage paths for signed forms per appointment.
-- Used to find form paths by appointment_id (e.g. in patient documents API).
-- ============================================

CREATE TABLE IF NOT EXISTS public.signed_form (
  id bigint generated always as identity not null,
  appointment_id bigint not null,
  telemedicine_form_path text null,
  hipaacompliance_form_path text null,
  generalsurgery_form_path text null,
  constraint signed_form_pkey primary key (id),
  constraint signed_form_appointment_unique unique (appointment_id),
  constraint signed_form_appointment_id_fkey foreign key (appointment_id) references appointments (id)
) TABLESPACE pg_default;

COMMENT ON TABLE public.signed_form IS 'One row per appointment: storage paths for signed telemedicine, HIPAA, and general surgery forms. Look up by appointment_id to get form paths.';
