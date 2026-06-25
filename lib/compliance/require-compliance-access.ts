import { AuthorizationError } from '@/lib/api-error-handler'
import { requireStaffSession } from '@/lib/auth/require-staff-session'
import { getLocationScopeForUser, type LocationScope } from '@/lib/locations/scope'
import { createAdminClient } from '@/lib/supabase/admin'
import { UserRole } from '@/lib/roles'
import type { StaffSession } from '@/lib/auth/require-staff-session'

export type ComplianceSession = StaffSession & {
  locationScope: LocationScope
}

export async function requireComplianceAccess(): Promise<ComplianceSession> {
  const session = await requireStaffSession()
  const admin = createAdminClient()

  if (session.role === UserRole.ADMIN) {
    return {
      ...session,
      locationScope: { unrestricted: true, locationIds: [] },
    }
  }

  // Only doctors may hold compliance_access — fnp and pa are explicitly excluded.
  if (session.role !== UserRole.DOCTOR) {
    throw new AuthorizationError('Compliance dashboard access is restricted to doctors and administrators')
  }

  const { data: profileByUid, error: uidErr } = await admin
    .from('profiles')
    .select('compliance_access')
    .eq('uid', session.user.id)
    .maybeSingle()

  let profile = profileByUid
  let error = uidErr

  if (!profile) {
    const { data: profileById, error: idErr } = await admin
      .from('profiles')
      .select('compliance_access')
      .eq('id', session.user.id)
      .maybeSingle()
    profile = profileById
    error = idErr
  }

  if (error) throw error
  if (!profile?.compliance_access) {
    throw new AuthorizationError('Compliance dashboard access is not enabled for this account')
  }

  const locationScope = await getLocationScopeForUser(admin, session.user.id, session.role)
  return { ...session, locationScope }
}
