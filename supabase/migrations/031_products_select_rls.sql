-- ============================================
-- Allow authenticated to read public.products (used by pre_sales and Final Review dropdown)
-- ============================================

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read products" ON public.products;
CREATE POLICY "Authenticated can read products"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);
