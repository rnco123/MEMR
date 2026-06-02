-- Align public.pharmacy to the requested full definition.
-- If table does not exist, create it. If it exists, add/align columns safely.

CREATE TABLE IF NOT EXISTS public.pharmacy (
  id bigint generated always as identity not null,
  name character varying(255) null,
  address character varying(255) null,
  city character varying(100) null,
  state character varying(50) null,
  zip_code character varying(20) null,
  phone_number character varying(20) null,
  spanish_language_service boolean null,
  disabled_access boolean null,
  license_status character varying(50) null,
  opening_hours json null,
  delivers boolean null default true,
  delivered_to_status_updated timestamp with time zone null,
  is_active boolean null default true,
  phone text null,
  email text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint pharmacies_pkey primary key (id)
) TABLESPACE pg_default;

ALTER TABLE public.pharmacy
  ADD COLUMN IF NOT EXISTS name character varying(255) null,
  ADD COLUMN IF NOT EXISTS address character varying(255) null,
  ADD COLUMN IF NOT EXISTS city character varying(100) null,
  ADD COLUMN IF NOT EXISTS state character varying(50) null,
  ADD COLUMN IF NOT EXISTS zip_code character varying(20) null,
  ADD COLUMN IF NOT EXISTS phone_number character varying(20) null,
  ADD COLUMN IF NOT EXISTS spanish_language_service boolean null,
  ADD COLUMN IF NOT EXISTS disabled_access boolean null,
  ADD COLUMN IF NOT EXISTS license_status character varying(50) null,
  ADD COLUMN IF NOT EXISTS opening_hours json null,
  ADD COLUMN IF NOT EXISTS delivers boolean null default true,
  ADD COLUMN IF NOT EXISTS delivered_to_status_updated timestamp with time zone null,
  ADD COLUMN IF NOT EXISTS is_active boolean null default true,
  ADD COLUMN IF NOT EXISTS phone text null,
  ADD COLUMN IF NOT EXISTS email text null,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone not null default now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone not null default now();

-- Keep phone and phone_number consistent for existing rows.
UPDATE public.pharmacy
SET
  phone = COALESCE(phone, phone_number),
  phone_number = COALESCE(phone_number, phone)
WHERE phone IS NULL OR phone_number IS NULL;

