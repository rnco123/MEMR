-- Patient search performance + correctness.
--
-- 1. date_of_birth is a DATE column, so the previous `date_of_birth ILIKE '%-MM-DD'`
--    filters used for "birthday without a year" searches error in Postgres
--    (operator does not exist: date ~~* unknown). Generated dob_month/dob_day
--    columns make that search expressible with plain indexed equality.
-- 2. Trigram GIN indexes back the leading-wildcard ILIKE searches on
--    first_name/last_name/email/phone (B-tree indexes cannot serve '%term%').
-- 3. B-tree on date_of_birth serves exact-date and year-range searches.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS dob_month smallint GENERATED ALWAYS AS ((EXTRACT(MONTH FROM date_of_birth))::smallint) STORED,
  ADD COLUMN IF NOT EXISTS dob_day smallint GENERATED ALWAYS AS ((EXTRACT(DAY FROM date_of_birth))::smallint) STORED;

CREATE INDEX IF NOT EXISTS idx_patients_date_of_birth ON public.patients (date_of_birth);
CREATE INDEX IF NOT EXISTS idx_patients_dob_month_day ON public.patients (dob_month, dob_day);

CREATE INDEX IF NOT EXISTS idx_patients_first_name_trgm ON public.patients USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_last_name_trgm ON public.patients USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_email_trgm ON public.patients USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_phone_trgm ON public.patients USING gin (phone gin_trgm_ops);
