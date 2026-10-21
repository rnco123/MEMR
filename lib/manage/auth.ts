import 'server-only'
import type { User } from '@supabase/supabase-js'
import { AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ADMIN_STAFF_ROLE_VALUES, UserRole, mapRoleToEnum } from '@/lib/roles'

export type ClinicManagerContext = {
  user: User
  /** The one tenant this manager may act on. Every /api/manage query is scoped to it. */
  tenantId: number
  admin: ReturnType<typeof createAdminClient>
}

/**
 * Ensures the session belongs to an active clinic manager with a tenant. The tenant
 * comes from the database profile, never from the request.
 */
export async function requireClinicManager(): Promise<ClinicManagerContext> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new AuthenticationError()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, tenant_id, active')
    .eq('uid', user.id)
    .maybeSingle()

  if (
    !profile ||
    profile.active === false ||
    mapRoleToEnum(profile.role as string | null) !== UserRole.CLINIC_MANAGER ||
    typeof profile.tenant_id !== 'number'
  ) {
    throw new AuthorizationError()
  }

  return { user, tenantId: profile.tenant_id, admin }
}

/** Ids of the manager's tenant's locations — the only ones they may assign or edit. */
export async function fetchTenantLocationIds(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: number
): Promise<Set<number>> {
  const { data, error } = await admin.from('locations').select('id').eq('tenant_id', tenantId)
  if (error) throw error
  return new Set((data ?? []).map((row) => row.id as number))
}

/**
 * What a clinic manager may read: their tenant's locations, and the staff who work
 * there. Staff a manager adds carry `profiles.tenant_id`; staff a MEMR admin adds
 * do not, and belong to the tenant only through `user_locations` at its locations —
 * so both are counted.
 */
export async function fetchTenantReadScope(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: number
): Promise<{ locationIds: number[]; staffUids: string[] }> {
  const locationIds = [...(await fetchTenantLocationIds(admin, tenantId))]

  const [{ data: owned, error: ownedErr }, { data: assigned, error: assignedErr }] = await Promise.all([
    admin.from('profiles').select('uid').eq('tenant_id', tenantId).in('role', [...ADMIN_STAFF_ROLE_VALUES]),
    locationIds.length
      ? admin.from('user_locations').select('user_uid').in('location_id', locationIds)
      : Promise.resolve({ data: [] as { user_uid: string }[], error: null }),
  ])
  if (ownedErr) throw ownedErr
  if (assignedErr) throw assignedErr

  const staffUids = new Set<string>()
  for (const p of owned ?? []) if (p.uid) staffUids.add(p.uid as string)
  for (const row of assigned ?? []) if (row.user_uid) staffUids.add(row.user_uid as string)
  return { locationIds, staffUids: [...staffUids] }
}

/**
 * For a clinic manager, the users whose support tickets they may read: their
 * tenant's staff and themselves. Null for anyone else, who keeps the existing rule
 * (admins see all, everyone else their own).
 */
export async function managerTicketCreatorUids(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  role: string | null | undefined
): Promise<string[] | null> {
  if (mapRoleToEnum(role ?? null) !== UserRole.CLINIC_MANAGER) return null
  const { data: profile } = await admin
    .from('profiles')
    .select('tenant_id, active')
    .eq('uid', userId)
    .maybeSingle()
  if (!profile || profile.active === false || typeof profile.tenant_id !== 'number') return [userId]
  const { staffUids } = await fetchTenantReadScope(admin, profile.tenant_id)
  return [...new Set([userId, ...staffUids])]
}
