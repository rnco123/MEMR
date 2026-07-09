import type { User } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/admin-auth'
import { AuthorizationError } from '@/lib/api-error-handler'
import { isReleaseLogsManager } from '@/lib/release-logs/manager'

export { RELEASE_LOGS_MANAGER_EMAIL, isReleaseLogsManager } from '@/lib/release-logs/manager'

/** Ensures the session is an admin AND the fixed release logs owner. */
export async function requireReleaseLogsManager(): Promise<User> {
  const user = await requireAdminUser()
  if (!isReleaseLogsManager(user)) throw new AuthorizationError()
  return user
}
