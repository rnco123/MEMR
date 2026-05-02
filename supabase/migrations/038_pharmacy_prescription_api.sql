-- ============================================
-- PHARMACY PRESCRIPTION FETCH API SUPPORT
-- ============================================

-- 1) Track which pharmacy should receive each prescription,
--    and when a pharmacy first fetched it.
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS pharmacy_id BIGINT REFERENCES public.pharmacy(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pharmacy_pulled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_prescriptions_pharmacy_id
  ON public.prescriptions(pharmacy_id);

CREATE INDEX IF NOT EXISTS idx_prescriptions_pharmacy_pulled_at
  ON public.prescriptions(pharmacy_pulled_at DESC);

-- 2) API keys for external pharmacy pull integration.
--    Store only SHA-256 hash of the key, never raw key.
CREATE TABLE IF NOT EXISTS public.pharmacy_api_keys (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pharmacy_id BIGINT NOT NULL REFERENCES public.pharmacy(id) ON DELETE CASCADE,
  key_name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_api_keys_pharmacy_id
  ON public.pharmacy_api_keys(pharmacy_id);

CREATE INDEX IF NOT EXISTS idx_pharmacy_api_keys_active
  ON public.pharmacy_api_keys(is_active, expires_at);

ALTER TABLE public.pharmacy_api_keys ENABLE ROW LEVEL SECURITY;

-- Clinical staff can view key metadata (not raw key, hash only)
DROP POLICY IF EXISTS "Clinical staff can view pharmacy api key metadata" ON public.pharmacy_api_keys;
CREATE POLICY "Clinical staff can view pharmacy api key metadata"
  ON public.pharmacy_api_keys
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.uid = auth.uid()
        AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );

-- Clinical staff can manage keys
DROP POLICY IF EXISTS "Clinical staff can manage pharmacy api keys" ON public.pharmacy_api_keys;
CREATE POLICY "Clinical staff can manage pharmacy api keys"
  ON public.pharmacy_api_keys
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.uid = auth.uid()
        AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.uid = auth.uid()
        AND profiles.role IN ('doctor', 'nurse', 'staff')
    )
  );
