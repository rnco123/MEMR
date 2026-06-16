import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { fetchProfileFields } from '@/lib/fetch-user-role'
import { mapRoleToEnum, UserRole } from '@/lib/roles'

/**
 * Resolve role for the current session.
 *
 * Security: always prefer `profiles.role` from the database (H-03).
 * `user_metadata.role` is display-only and must never be used for authorization
 * decisions — a user can supply arbitrary metadata at signup.
 */
export async function resolveAuthenticatedRole(
  supabase: SupabaseClient,
  user: User
): Promise<UserRole | null> {
  // Primary: database profile row (authoritative source of truth).
  const profile = await fetchProfileFields(supabase, user.id, 'role', { email: user.email })
  const dbRole = typeof profile?.role === 'string' ? profile.role : null
  const resolvedDbRole = mapRoleToEnum(dbRole)
  if (resolvedDbRole) return resolvedDbRole

  // Fallback only when no profile exists yet (new user in onboarding).
  // Do NOT use metadata as a privilege escalation path.
  return null
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
