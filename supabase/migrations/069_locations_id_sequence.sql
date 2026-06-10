-- locations.id was manually assigned historically; enable auto-increment for admin creates.

CREATE SEQUENCE IF NOT EXISTS public.locations_id_seq AS bigint;

SELECT setval(
  'public.locations_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM public.locations), 0), 1)
);

ALTER TABLE public.locations
  ALTER COLUMN id SET DEFAULT nextval('public.locations_id_seq');

ALTER SEQUENCE public.locations_id_seq OWNED BY public.locations.id;
