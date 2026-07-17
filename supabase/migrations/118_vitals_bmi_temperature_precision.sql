-- BMI can exceed 999.9 for extreme (still range-valid) weight/height pairs.
-- numeric(4,1) caused 22003 overflows on vitals save.
ALTER TABLE public.vitals
  ALTER COLUMN bmi TYPE NUMERIC(6, 2)
  USING ROUND(bmi::numeric, 2);

ALTER TABLE public.vitals
  ALTER COLUMN temperature TYPE NUMERIC(6, 2)
  USING ROUND(temperature::numeric, 2);

COMMENT ON COLUMN public.vitals.bmi IS 'Body mass index; numeric(6,2) supports extreme valid vital combinations.';
COMMENT ON COLUMN public.vitals.temperature IS 'Temperature value in temperature_unit; widened for safe inserts.';
