import { createClient } from '@/lib/supabase/server'
import { AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { mapRoleToEnum, UserRole } from '@/lib/roles'
import type { User } from '@supabase/supabase-js'

/** Ensures the current session belongs to an admin (above location restrictions). */
export async function requireAdminUser(): Promise<User> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new AuthenticationError()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('uid', user.id)
    .maybeSingle()

  if (mapRoleToEnum(profile?.role) !== UserRole.ADMIN) {
    throw new AuthorizationError()
  }

  return user
}
