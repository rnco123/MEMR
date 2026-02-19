-- ============================================
-- RLS POLICIES FOR AI_SOAPNOTES TABLE
-- Allows doctors and nurses to view AI-generated SOAP notes by encounter_id
-- ============================================

-- Enable Row Level Security (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_soapnotes') THEN
    ALTER TABLE public.ai_soapnotes ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Doctors can view ai_soapnotes" ON public.ai_soapnotes;
    DROP POLICY IF EXISTS "Nurses can view ai_soapnotes" ON public.ai_soapnotes;
    DROP POLICY IF EXISTS "Doctors can manage ai_soapnotes" ON public.ai_soapnotes;
    DROP POLICY IF EXISTS "Nurses can manage ai_soapnotes" ON public.ai_soapnotes;
    
    -- Policy: Doctors can view ALL ai_soapnotes
    CREATE POLICY "Doctors can view ai_soapnotes"
      ON public.ai_soapnotes
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.uid = auth.uid()
          AND profiles.role = 'doctor'
        )
      );
    
    -- Policy: Nurses/Staff can view ALL ai_soapnotes
    CREATE POLICY "Nurses can view ai_soapnotes"
      ON public.ai_soapnotes
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.uid = auth.uid()
          AND profiles.role IN ('nurse', 'staff')
        )
      );
    
    -- Policy: Doctors can insert/update ai_soapnotes
    CREATE POLICY "Doctors can manage ai_soapnotes"
      ON public.ai_soapnotes
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.uid = auth.uid()
          AND profiles.role = 'doctor'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.uid = auth.uid()
          AND profiles.role = 'doctor'
        )
      );
    
    -- Policy: Nurses/Staff can insert/update ai_soapnotes
    CREATE POLICY "Nurses can manage ai_soapnotes"
      ON public.ai_soapnotes
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.uid = auth.uid()
          AND profiles.role IN ('nurse', 'staff')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.uid = auth.uid()
          AND profiles.role IN ('nurse', 'staff')
        )
      );
  END IF;
END $$;
