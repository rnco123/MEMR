-- ============================================
-- RLS for category_memr and product_memr so nurses/doctors can fetch in Final Review
-- ============================================

ALTER TABLE public.category_memr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_memr ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read category_memr" ON public.category_memr;
CREATE POLICY "Authenticated can read category_memr"
  ON public.category_memr FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can read product_memr" ON public.product_memr;
CREATE POLICY "Authenticated can read product_memr"
  ON public.product_memr FOR SELECT
  TO authenticated
  USING (true);

-- pre_sales: allow authenticated to select/insert for their workflow
ALTER TABLE public.pre_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can manage pre_sales" ON public.pre_sales;
CREATE POLICY "Authenticated can manage pre_sales"
  ON public.pre_sales FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
