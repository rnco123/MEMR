import type { UserRole } from '@/lib/roles'
import { UserRole as UserRoleEnum } from '@/lib/roles'

/** Minimum time to show the post-login Lottie redirect screen. */
export const POST_LOGIN_REDIRECT_MIN_MS = 1800

export function postLoginDestination(role: UserRole | string | null): string {
  if (role === UserRoleEnum.ADMIN || role === 'admin') return '/admin'
  return '/dashboard'
}
