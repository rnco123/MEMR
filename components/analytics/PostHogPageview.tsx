'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { getPostHogHost, getPostHogKey, isPostHogEnabled } from '@/lib/analytics/posthog'

/**
 * Product analytics only — autocapture and session recording are explicitly disabled
 * so clicks/inputs/DOM snapshots from clinical forms never reach PostHog.
 * Manual pageview capture only, on route change.
 */
export function PostHogPageview() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initialized = useRef(false)

  useEffect(() => {
    if (!isPostHogEnabled() || initialized.current) return
    initialized.current = true
    posthog.init(getPostHogKey(), {
      api_host: getPostHogHost(),
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: true,
      disable_session_recording: true,
      person_profiles: 'identified_only',
    })
  }, [])

  useEffect(() => {
    if (!isPostHogEnabled() || !initialized.current) return
    const query = searchParams.toString()
    posthog.capture('$pageview', {
      $current_url: query ? `${pathname}?${query}` : pathname,
    })
  }, [pathname, searchParams])

  return null
}
