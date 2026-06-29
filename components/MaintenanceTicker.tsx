'use client'

import { useEffect } from 'react'

/**
 * Thin site-wide maintenance ticker.
 *
 * Shown on every page (mounted in the root layout) while the app is unstable / under
 * maintenance. Toggle without a redeploy via NEXT_PUBLIC_MAINTENANCE_TICKER:
 *   - unset / 'false'  → hidden
 *   - 'true'           → shown with the default message
 *   - any other string → shown with that string as the message
 *
 * When shown it adds `.maintenance-ticker-on` to <html>, which sets the --mtk-h CSS var
 * (see globals.css). Full-height app shells offset/subtract by that var so the fixed bar
 * reserves space instead of overlapping the header. When off, --mtk-h is 0 → zero effect.
 */

const DEFAULT_MESSAGE = 'System maintenance in progress — some features may be unavailable.'
const HEIGHT_CLASS = 'h-7' // keep in sync with --mtk-h (1.75rem) in globals.css

function resolveMessage(): string | null {
  const raw = process.env.NEXT_PUBLIC_MAINTENANCE_TICKER
  if (!raw || raw === 'false') return null
  if (raw === 'true') return DEFAULT_MESSAGE
  return raw
}

export function MaintenanceTicker() {
  const message = resolveMessage()

  useEffect(() => {
    if (!message) return
    const root = document.documentElement
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
