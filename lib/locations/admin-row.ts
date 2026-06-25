export const LOCATION_ADMIN_SELECT =
  'id, title, location_code, location_group, address, phone, email, opening_hours, google_map_url, is_active, tenant_id, external_location_id, created_at, updated_at, tenants:tenant_id (id, name, tenant_code)'

export type AdminLocationRow = {
  id: number
  title: string
  location_code: string | null
  location_group: string | null
  address: string | null
  phone: string | null
  email: string | null
  opening_hours: string | null
  google_map_url: string | null
  is_active: boolean
  tenant_id: number | null
  tenant_name: string | null
  tenant_code: string | null
  created_at: string
  updated_at: string | null
}

function readTenantJoin(value: unknown): { id?: number; name?: string; tenant_code?: string } | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as { id?: number; name?: string; tenant_code?: string }
  }
  if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
    return value[0] as { id?: number; name?: string; tenant_code?: string }
  }
  return null
}

export function normalizeAdminLocationRow(row: Record<string, unknown>): AdminLocationRow {
  const tenant = readTenantJoin(row.tenants)
  const rawTenantId = row.tenant_id
  const tenantId =
    rawTenantId === null || rawTenantId === undefined
      ? tenant?.id ?? null
      : Number(rawTenantId)

  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    location_code: (row.location_code as string | null) ?? null,
    location_group: (row.location_group as string | null)?.trim() || null,
    address: (row.address as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    opening_hours: (row.opening_hours as string | null) ?? null,
    google_map_url: (row.google_map_url as string | null) ?? null,
    is_active: row.is_active !== false,
    tenant_id: tenantId,
    tenant_name: tenant?.name ?? (tenantId != null ? `Tenant ${tenantId}` : null),
    tenant_code: tenant?.tenant_code ?? (tenantId != null ? String(tenantId) : null),
    created_at: String(row.created_at ?? ''),
    updated_at: (row.updated_at as string | null) ?? null,
  }
}
