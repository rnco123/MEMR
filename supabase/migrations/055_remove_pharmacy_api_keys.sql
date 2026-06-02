-- Remove legacy pharmacy API key system.
-- Pharmacies are now managed via authenticated admin access only.

DROP TABLE IF EXISTS public.pharmacy_api_keys CASCADE;
