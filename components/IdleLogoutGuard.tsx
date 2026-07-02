'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useT } from '@/lib/i18n'
import { logAuditEventClient } from '@/lib/audit'
import {
  IDLE_ACTIVITY_STORAGE_KEY,
  getIdlePhase,
  idleSecondsLeft,
  isIdleExemptPath,
} from '@/lib/auth/idle-logout'

/** Throttle for localStorage writes from passive activity events. */
const ACTIVITY_WRITE_INTERVAL_MS = 5_000
const POLL_INTERVAL_MS = 1_000

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
]

/**
 * HIPAA automatic logoff: signs the user out after 20 minutes of inactivity,
 * with a 60-second countdown warning. Mounted once in the root layout;
 * no-ops when unauthenticated and while on an active video visit.
 */
export function IdleLogoutGuard() {
  const { user, signOut } = useAuth()
  const { t } = useT()
  const pathname = usePathname()

  const [warningOpen, setWarningOpen] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [signingOut, setSigningOut] = useState(false)

  // In-memory fallback when localStorage is unavailable (private mode / quota).
  const lastActivityRef = useRef<number>(Date.now())
  const lastWriteRef = useRef<number>(0)
  const warningOpenRef = useRef(false)
  const signingOutRef = useRef(false)
  warningOpenRef.current = warningOpen

  const recordActivity = useCallback((force = false) => {
    const now = Date.now()
    if (!force && now - lastWriteRef.current < ACTIVITY_WRITE_INTERVAL_MS) return
    lastWriteRef.current = now
    lastActivityRef.current = now
    try {
      window.localStorage.setItem(IDLE_ACTIVITY_STORAGE_KEY, String(now))
    } catch {
      // Storage unavailable — in-memory ref still tracks this tab.
    }
  }, [])

  const readLastActivity = useCallback((): number => {
    let stored = 0
    try {
      stored = Number(window.localStorage.getItem(IDLE_ACTIVITY_STORAGE_KEY)) || 0
    } catch {
      // ignore
    }
    // Trust whichever is most recent; guards against a stale key from a
    // previous session and clocks that another tab has already advanced.
    return Math.max(stored, lastActivityRef.current)
  }, [])

  const doSignOut = useCallback(
    async (reason: 'idle_timeout' | 'idle_warning_manual') => {
      if (signingOutRef.current) return
      signingOutRef.current = true
      setSigningOut(true)
      if (user?.id) {
        // Best-effort: don't block logoff on the audit call.
        await Promise.race([
          logAuditEventClient('user_logged_out', 'user', user.id, { reason }).catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ])
      }
      await signOut()
    },
    [signOut, user?.id]
  )

  const keepSignedIn = useCallback(() => {
    recordActivity(true)
    setWarningOpen(false)
  }, [recordActivity])

  // Reset the clock whenever a session starts (prevents a stale timestamp
  // from a previous user immediately logging the new session out).
  useEffect(() => {
    if (user) recordActivity(true)
  }, [user, recordActivity])

  // Passive activity listeners. While the warning is open, passive activity
  // in this tab is ignored — dismissing requires an explicit button click
  // (activity in ANOTHER tab still dismisses via the shared storage key).
  useEffect(() => {
    if (!user) return

    const onActivity = () => {
      if (warningOpenRef.current || signingOutRef.current) return
      recordActivity()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onActivity()
    }

    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, onActivity, { passive: true })
    window.addEventListener('scroll', onActivity, { passive: true, capture: true })
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, onActivity)
      window.removeEventListener('scroll', onActivity, { capture: true } as EventListenerOptions)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [user, recordActivity])

  // Poll loop: drives the countdown, the warning modal, and the logoff.
  useEffect(() => {
    if (!user) {
      setWarningOpen(false)
      return
    }

    const tick = () => {
      if (signingOutRef.current) return

      // An active telemedicine call counts as activity.
      if (isIdleExemptPath(pathname)) {
        recordActivity()
        if (warningOpenRef.current) setWarningOpen(false)
        return
      }

      const idleMs = Date.now() - readLastActivity()
      const phase = getIdlePhase(idleMs)

      if (phase === 'expired') {
        void doSignOut('idle_timeout')
        return
      }
      if (phase === 'warning') {
        setSecondsLeft(idleSecondsLeft(idleMs))
        if (!warningOpenRef.current) setWarningOpen(true)
        return
      }
      // Activity elsewhere (e.g. another tab) reset the clock.
      if (warningOpenRef.current) setWarningOpen(false)
    }

    const interval = window.setInterval(tick, POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [user, pathname, readLastActivity, recordActivity, doSignOut])

  if (!user || !warningOpen) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-logout-title"
      aria-describedby="idle-logout-body"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <div className="flex gap-4">
            <div
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-amber-100 text-amber-600"
              aria-hidden
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h3 id="idle-logout-title" className="text-lg font-bold text-slate-900">
                {t('idle.title')}
              </h3>
              <p id="idle-logout-body" className="mt-2 text-sm text-slate-600 leading-relaxed">
                {t('idle.body', { seconds: secondsLeft })}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={() => void doSignOut('idle_warning_manual')}
            disabled={signingOut}
            className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {signingOut ? t('idle.signing_out') : t('idle.logout_now')}
          </button>
          <button
            type="button"
            onClick={keepSignedIn}
            disabled={signingOut}
            autoFocus
            className="h-10 px-4 rounded-xl text-sm font-semibold text-white bg-[#2E6EF3] hover:bg-[#1f5ad2] disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EF3]/50"
          >
            {t('idle.stay')}
          </button>
        </div>
      </div>
    </div>
  )
}
