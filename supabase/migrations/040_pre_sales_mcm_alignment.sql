-- Align EMR public.pre_sales with MCM-style columns used by Final Review.
-- encounter_id continues to reference EMR public.encounters(id); MCM sync uses encounters.mcm_encounter_id in API routes.

ALTER TABLE public.pre_sales
  ADD COLUMN IF NOT EXISTS product_quantity_taken integer NOT NULL DEFAULT 0;

-- Extend enum from 029 (pending, completed) with initiated (matches MCM pre_sales flow)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pre_sale_status') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'pre_sale_status' AND e.enumlabel = 'initiated'
    ) THEN
      ALTER TYPE public.pre_sale_status ADD VALUE 'initiated';
    END IF;
  END IF;
END $$;

-- Point product_id at public.products(product_id) when that table exists (MCM catalog IDs).
-- Keeps product_memr FK if products table is missing (older DBs).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'product_id'
  ) THEN
    ALTER TABLE public.pre_sales DROP CONSTRAINT IF EXISTS pre_sales_product_id_fkey;
    ALTER TABLE public.pre_sales
      ADD CONSTRAINT pre_sales_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products (product_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '040: left pre_sales product FK unchanged: %', SQLERRM;
END $$;
