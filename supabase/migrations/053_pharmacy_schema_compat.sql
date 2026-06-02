-- Align existing pharmacy schema with app expectations.
-- Some environments have phone_number/city/state/... but no phone/email/timestamps.

ALTER TABLE public.pharmacy
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;

-- Backfill phone from legacy phone_number where available.
UPDATE public.pharmacy
SET phone = COALESCE(phone, phone_number)
WHERE phone IS NULL;

