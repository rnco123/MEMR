-- ============================================
-- Fix policy so products and pre_sales work (dropdown + insert)
-- Run this if products don't load or pre_sales insert fails
-- ============================================

-- Products: ensure SELECT for authenticated (and anon in case app uses anon key)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read products" ON public.products;
CREATE POLICY "Authenticated can read products"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "anon can read products" ON public.products;
CREATE POLICY "anon can read products"
  ON public.products FOR SELECT
  TO anon
  USING (true);

-- Pre_sales: SELECT + INSERT for authenticated (so list and add products work)
ALTER TABLE public.pre_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can manage pre_sales" ON public.pre_sales;
CREATE POLICY "Authenticated can manage pre_sales"
  ON public.pre_sales FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
