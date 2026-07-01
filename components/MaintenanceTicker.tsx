'use client'

import { useEffect } from 'react'
import { resolveMaintenanceTickerMessage } from '@/lib/maintenance-ticker'

/**
 * Thin site-wide maintenance ticker.
 *
 * Shown on every page (mounted in the root layout) while the app is unstable / under
 * maintenance. Toggle without a redeploy via NEXT_PUBLIC_MAINTENANCE_TICKER:
 *   - unset / 'false' / '0' / 'off'  → hidden
 *   - 'true'                         → shown with the default message
 *   - any other string               → shown with that string as the message
 *
 * When shown it adds `.maintenance-ticker-on` to <html> for any CSS that still keys off
 * --mtk-h. App shells use build-time helpers in lib/maintenance-ticker.ts so they do not
 * reserve space when the ticker is disabled.
 */

const HEIGHT_CLASS = 'h-7' // keep in sync with MAINTENANCE_TICKER_HEIGHT

export function MaintenanceTicker() {
  const message = resolveMaintenanceTickerMessage()

  useEffect(() => {
    const root = document.documentElement
    if (!message) {
      root.classList.remove('maintenance-ticker-on')
      return
    }
    root.classList.add('maintenance-ticker-on')
    return () => root.classList.remove('maintenance-ticker-on')
  }, [message])

  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-[100] flex items-center overflow-hidden bg-amber-500 text-white ${HEIGHT_CLASS}`}
    >
      <div className="flex h-full items-center whitespace-nowrap animate-[maintenance-ticker_22s_linear_infinite]">
        {/* Duplicated so the marquee loops seamlessly. */}
        {[0, 1].map((i) => (
          <span key={i} className="mx-8 flex shrink-0 items-center gap-2 text-xs font-medium tracking-wide">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
            </svg>
            {message}
          </span>
        ))}
      </div>
    </div>
  )
}
