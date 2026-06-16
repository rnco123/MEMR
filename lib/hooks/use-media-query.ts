'use client'

import { useEffect, useState } from 'react'

/**
 * Single source of truth for the adaptive breakpoint strategy.
 *
 *  - Mobile  : < 1024px  (app-like experience: bottom tabs, sheets, edge-to-edge)
 *  - Desktop : >= 1024px (existing web platform: sidebar/topbar, max-width layouts)
 *
 * 1024px (Tailwind `lg`) is the device boundary used across the whole platform.
 * Keep this aligned with the `lg:` utilities used in layouts/components.
 */
export const MOBILE_MAX_WIDTH = 1023
export const DESKTOP_MIN_WIDTH = 1024

export const MEDIA_QUERIES = {
  mobile: `(max-width: ${MOBILE_MAX_WIDTH}px)`,
  desktop: `(min-width: ${DESKTOP_MIN_WIDTH}px)`,
  standalone: '(display-mode: standalone)',
} as const

/**
 * SSR-safe media query hook. Returns `false` during the server render and the
 * first client paint, then updates once mounted to avoid hydration mismatches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)

    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])

  return matches
}

/** True on phone/small-tablet widths (< 1024px). Drives app-like mobile UX. */
export function useIsMobile(): boolean {
  return useMediaQuery(MEDIA_QUERIES.mobile)
}

/** True on desktop widths (>= 1024px). Preserves the web platform experience. */
export function useIsDesktop(): boolean {
  return useMediaQuery(MEDIA_QUERIES.desktop)
}
