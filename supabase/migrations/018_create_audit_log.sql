-- ============================================
-- CREATE AUDIT LOG TABLE FOR HIPAA COMPLIANCE
-- Tracks all user actions for compliance and security
-- ============================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- RLS Policies
-- Only admins and the user themselves can view their own audit logs
-- In production, you may want to restrict this further

-- Policy: Users can view their own audit logs
CREATE POLICY "Users can view own audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: System can insert audit logs (authenticated users via API)
CREATE POLICY "Authenticated users can create audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: Only admins can view all audit logs
-- Note: This assumes you have an 'admin' role in profiles table
-- If not, you can modify this policy
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.uid = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Function to automatically clean old audit logs (optional)
-- Run this periodically to archive old logs
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
  -- Delete logs older than 7 years (HIPAA requirement: 6 years minimum)
  DELETE FROM public.audit_logs
  WHERE created_at < NOW() - INTERVAL '7 years';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
