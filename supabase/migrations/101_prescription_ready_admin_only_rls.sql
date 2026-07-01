-- Restrict prescription_ready reads to admins only (queue is admin-only UX).
-- Server routes use the service-role client; physicians only need the released flag via API.

DROP POLICY IF EXISTS "Clinical staff can view prescription ready" ON public.prescription_ready;

CREATE POLICY "Admins can view prescription ready"
  ON public.prescription_ready
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'admin'
    )
  );
