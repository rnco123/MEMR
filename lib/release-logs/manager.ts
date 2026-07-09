import type { User } from '@supabase/supabase-js'

/** Sole account allowed to create/edit/release entries. All other admins are read-only. */
export const RELEASE_LOGS_MANAGER_EMAIL = 'raheel@myclinicmd.com'

export function isReleaseLogsManager(user: Pick<User, 'email'>): boolean {
  return (user.email ?? '').trim().toLowerCase() === RELEASE_LOGS_MANAGER_EMAIL
}
