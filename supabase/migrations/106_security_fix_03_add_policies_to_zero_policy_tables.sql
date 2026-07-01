-- Captured from live database into git for record-keeping.
-- Original applied version: 20260628145737 (2026-06-28) — already applied to STAGING + PRODUCTION.
-- Part of the June 2026 Supabase security-linter remediation batch (fixes 01-10).

-- ============================================================
-- SECURITY FIX 03: Add RLS policies to 7 tables that had none.
-- These were effectively deny-all (broken for authenticated users).
-- ============================================================

-- ── roles (reference table — read-only for all authenticated) ──
CREATE POLICY "roles_authenticated_read"
  ON public.roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "roles_admin_write"
  ON public.roles
  FOR ALL
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- ── permissions (reference table) ─────────────────────────────
CREATE POLICY "permissions_authenticated_read"
  ON public.permissions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "permissions_admin_write"
  ON public.permissions
  FOR ALL
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- ── categories (product/service categories — reference data) ───
CREATE POLICY "categories_authenticated_read"
  ON public.categories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "categories_admin_write"
  ON public.categories
  FOR ALL
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- ── user_permissions (role-permission mapping) ─────────────────
CREATE POLICY "user_permissions_authenticated_read"
  ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "user_permissions_admin_write"
  ON public.user_permissions
  FOR ALL
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- ── tenants (multi-tenant org record) ─────────────────────────
CREATE POLICY "tenants_authenticated_read"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "tenants_admin_write"
  ON public.tenants
  FOR ALL
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- ── status_timeline (encounter workflow events) ────────────────
-- Clinical staff need to read it; inserts happen via server/trigger
CREATE POLICY "status_timeline_clinical_read"
  ON public.status_timeline
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  );

CREATE POLICY "status_timeline_clinical_insert"
  ON public.status_timeline
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('doctor', 'fnp', 'pa', 'nurse', 'staff', 'admin')
    )
  );

CREATE POLICY "status_timeline_admin_delete"
  ON public.status_timeline
  FOR DELETE
  TO authenticated
  USING (is_admin_user());

-- ── sales_history (financial records) ─────────────────────────
CREATE POLICY "sales_history_staff_read"
  ON public.sales_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('nurse', 'staff', 'admin')
    )
  );

CREATE POLICY "sales_history_staff_insert"
  ON public.sales_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.uid = auth.uid())
        AND p.role IN ('nurse', 'staff', 'admin')
    )
  );

CREATE POLICY "sales_history_admin_manage"
  ON public.sales_history
  FOR ALL
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());
