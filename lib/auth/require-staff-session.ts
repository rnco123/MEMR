import { createClient } from '@/lib/supabase/server'
import { AuthenticationError, AuthorizationError } from '@/lib/api-error-handler'
import { loadProfileForUser } from '@/lib/profile/load-profile'
import { mapRoleToEnum, UserRole } from '@/lib/roles'
import type { SupabaseClient, User } from '@supabase/supabase-js'

const STAFF_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE]

export type StaffSession = {
  supabase: SupabaseClient
  user: User
  email: string
  role: UserRole
}

export async function requireStaffSession(): Promise<StaffSession> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user?.email) {
    throw new AuthenticationError()
  }

  const profile = await loadProfileForUser(supabase, user.id, { email: user.email })
  const role = mapRoleToEnum(profile?.role ?? null)

  if (!role || !STAFF_ROLES.includes(role)) {
    throw new AuthorizationError('This account cannot change its password here')
  }

  if (profile?.active === false) {
    throw new AuthorizationError('Account is inactive')
  }

  return { supabase, user, email: user.email, role }
}
