/**
 * Idle auto-logout policy (HIPAA §164.312(a)(2)(iii) — automatic logoff).
 *
 * 20 minutes of inactivity signs the user out. A warning modal with a live
 * countdown appears for the final 60 seconds, offering "Keep me signed in"
 * and "Log out now". Active video visits are exempt — a provider on a call
 * is not idle even when not touching the keyboard.
 */

export const IDLE_TIMEOUT_MS = 20 * 60 * 1000
export const IDLE_WARNING_MS = 60 * 1000

/** localStorage key shared across tabs so activity anywhere keeps every tab alive. */
export const IDLE_ACTIVITY_STORAGE_KEY = 'memr.last-activity'

export type IdlePhase = 'active' | 'warning' | 'expired'

export function getIdlePhase(idleMs: number): IdlePhase {
  if (idleMs >= IDLE_TIMEOUT_MS) return 'expired'
  if (idleMs >= IDLE_TIMEOUT_MS - IDLE_WARNING_MS) return 'warning'
  return 'active'
}

/** Whole seconds remaining before auto-logout while in the warning phase. */
export function idleSecondsLeft(idleMs: number): number {
  return Math.max(0, Math.ceil((IDLE_TIMEOUT_MS - idleMs) / 1000))
}

/** Paths where the idle timer is suspended (active telemedicine call). */
export function isIdleExemptPath(pathname: string | null): boolean {
  return !!pathname && (pathname === '/video' || pathname.startsWith('/video/'))
}
