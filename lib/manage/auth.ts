import 'server-only'
import type { User } from '@supabase/supabase-js'
import { AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { UserRole, mapRoleToEnum } from '@/lib/roles'

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
