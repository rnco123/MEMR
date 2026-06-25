-- Physician encounter review audit (10% NP/PA compliance).
-- Additive only: no backfill, no triggers, no changes to encounter workflow status.
-- Chart = patient record; audit unit = one encounter (visit).

-- ---------------------------------------------------------------------------
-- Optional link on encounters: who documented the visit (FNP/PA). Nullable —
-- existing rows and code paths are unchanged until app sets this explicitly.
-- ---------------------------------------------------------------------------
ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS documenting_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.encounters.documenting_user_id IS
  'Auth user (typically FNP/PA) who completed encounter documentation. Used for physician audit; NULL on legacy encounters.';

CREATE INDEX IF NOT EXISTS idx_encounters_documenting_user_id
  ON public.encounters(documenting_user_id)
  WHERE documenting_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- One audit row per encounter (when NP/PA review is required).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.encounter_physician_reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id BIGINT NOT NULL UNIQUE REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  documenting_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    review_status IN (
      'not_required',
      'pending',
      'reviewed',
      'consult_concluded',
      'physician_signed'
    )
  ),
  reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  findings TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.encounter_physician_reviews IS
  'Physician oversight audit per encounter (not per patient chart). One row per visit requiring MD review of NP/PA documentation.';
COMMENT ON COLUMN public.encounter_physician_reviews.documenting_user_id IS
  'FNP/PA auth user who completed the encounter documentation.';
COMMENT ON COLUMN public.encounter_physician_reviews.review_status IS
  'not_required = MD-only visit; pending = awaiting review; reviewed/consult_concluded/physician_signed = MD audit complete.';
COMMENT ON COLUMN public.encounter_physician_reviews.reviewed_by_user_id IS
  'Supervising physician (typically MD) who performed the audit review.';

CREATE INDEX IF NOT EXISTS idx_epr_encounter_id
  ON public.encounter_physician_reviews(encounter_id);

CREATE INDEX IF NOT EXISTS idx_epr_patient_id
  ON public.encounter_physician_reviews(patient_id);

CREATE INDEX IF NOT EXISTS idx_epr_documenting_user_id
  ON public.encounter_physician_reviews(documenting_user_id);

CREATE INDEX IF NOT EXISTS idx_epr_review_status
  ON public.encounter_physician_reviews(review_status);

CREATE INDEX IF NOT EXISTS idx_epr_reviewed_at
  ON public.encounter_physician_reviews(reviewed_at DESC)
  WHERE reviewed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_epr_pending_documenting
  ON public.encounter_physician_reviews(documenting_user_id, created_at DESC)
  WHERE review_status = 'pending';

-- ---------------------------------------------------------------------------
-- RLS — read/write for clinical reviewers only; no impact on other tables.
-- ---------------------------------------------------------------------------
ALTER TABLE public.encounter_physician_reviews ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_compliance_staff_role(role_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT role_text IN ('doctor', 'fnp', 'pa', 'admin');
$$;

COMMENT ON FUNCTION public.is_compliance_staff_role(text) IS
  'Roles that may view and manage encounter physician review audit rows.';

DROP POLICY IF EXISTS "Compliance staff select encounter physician reviews"
  ON public.encounter_physician_reviews;

CREATE POLICY "Compliance staff select encounter physician reviews"
  ON public.encounter_physician_reviews
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE public.is_compliance_staff_role(p.role)
        AND (p.id = auth.uid() OR p.uid = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Compliance staff insert encounter physician reviews"
  ON public.encounter_physician_reviews;

CREATE POLICY "Compliance staff insert encounter physician reviews"
  ON public.encounter_physician_reviews
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE public.is_compliance_staff_role(p.role)
        AND (p.id = auth.uid() OR p.uid = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Compliance staff update encounter physician reviews"
  ON public.encounter_physician_reviews;

CREATE POLICY "Compliance staff update encounter physician reviews"
  ON public.encounter_physician_reviews
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE public.is_compliance_staff_role(p.role)
        AND (p.id = auth.uid() OR p.uid = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE public.is_compliance_staff_role(p.role)
        AND (p.id = auth.uid() OR p.uid = auth.uid())
    )
  );
