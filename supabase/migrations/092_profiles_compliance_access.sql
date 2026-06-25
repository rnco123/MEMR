-- Per-user compliance dashboard access (scoped to assigned locations in app code).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS compliance_access BOOLEAN NOT NULL DEFAULT false;

-- Preserve existing physician compliance access until admins opt users in/out explicitly.
UPDATE public.profiles
SET compliance_access = true
WHERE role IN ('doctor', 'fnp', 'pa')
  AND compliance_access = false;

CREATE INDEX IF NOT EXISTS idx_profiles_compliance_access
  ON public.profiles (compliance_access)
  WHERE compliance_access = true;
