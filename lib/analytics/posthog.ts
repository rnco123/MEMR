/**
 * PostHog product analytics (client-side only).
 *
 * - Public: NEXT_PUBLIC_POSTHOG_KEY — safe for the browser.
 * - Public: NEXT_PUBLIC_POSTHOG_HOST — optional, defaults to PostHog Cloud (US).
 *
 * Per monitoring rules, PostHog is enabled only in production — inactive in
 * development/staging regardless of whether the key is set, and inactive everywhere
 * until NEXT_PUBLIC_POSTHOG_KEY is set. No script loads, no events captured, otherwise.
 */

import { isProduction } from '@/lib/config/environment'

export function isPostHogEnabled(): boolean {
  return isProduction && Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
}

export function getPostHogKey(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY || ''
}

export function getPostHogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
}
