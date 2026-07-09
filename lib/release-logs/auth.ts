import type { User } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/admin-auth'
import { AuthorizationError } from '@/lib/api-error-handler'

/** Sole account allowed to create/edit/release entries. All other admins are read-only. */
export const RELEASE_LOGS_MANAGER_EMAIL = 'raheel@myclinicmd.com'

export function isReleaseLogsManager(user: User): boolean {
  return (user.email ?? '').trim().toLowerCase() === RELEASE_LOGS_MANAGER_EMAIL
}

/** Ensures the session is an admin AND the fixed release logs owner. */
export async function requireReleaseLogsManager(): Promise<User> {
  const user = await requireAdminUser()
  if (!isReleaseLogsManager(user)) throw new AuthorizationError()
  return user
}
