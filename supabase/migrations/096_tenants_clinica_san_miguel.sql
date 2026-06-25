-- Rename default tenant to Clinica San Miguel and remove unused Kempen tenant.
-- Kempwood (id 3) is unchanged.

UPDATE public.tenants
SET name = 'Clinica San Miguel',
    updated_at = now()
WHERE id = 1;

DELETE FROM public.tenants
WHERE id = 2
  AND NOT EXISTS (
    SELECT 1 FROM public.locations WHERE tenant_id = 2
  );
