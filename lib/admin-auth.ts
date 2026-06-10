import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { fetchProfileFields } from '@/lib/fetch-user-role'
import { mapRoleToEnum, UserRole } from '@/lib/roles'

/** Resolve role for the current session (metadata → profiles id/uid/email). */
export async function resolveAuthenticatedRole(
  supabase: SupabaseClient,
  user: User
): Promise<UserRole | null> {
  const metadataRole = mapRoleToEnum(user.user_metadata?.role)
  if (metadataRole) return metadataRole

  const profile = await fetchProfileFields(supabase, user.id, 'role', { email: user.email })
  const dbRole = typeof profile?.role === 'string' ? profile.role : null
  return mapRoleToEnum(dbRole)
}

/** Ensures the current session belongs to an admin (above location restrictions). */
export async function requireAdminUser(): Promise<User> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new AuthenticationError()

  if ((await resolveAuthenticatedRole(supabase, user)) !== UserRole.ADMIN) {
    throw new AuthorizationError()
  }

  return user
}
