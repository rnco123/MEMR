/**
 * Rate limiting utility using an in-memory LRU cache.
 * Prevents abuse of API endpoints (brute-force logins, etc.).
 *
 * Notes / limitations:
 * - State is per-process and in-memory. In a multi-instance / serverless
 *   deployment each instance has its own counters. For strong guarantees
 *   across instances, back this with a shared store (e.g. Redis/Upstash).
 *
 * Install: npm install lru-cache
 */

import { LRUCache } from 'lru-cache'

interface RateLimitOptions {
  limit?: number
  windowMs?: number
}

export interface RateLimitStatus {
  /** Whether the identifier is currently over the limit. */
  blocked: boolean
  /** Current attempt count within the active window. */
  count: number
  /** Remaining allowed attempts before blocking. */
  remaining: number
  /** Milliseconds until the current window expires (0 if no active window). */
  retryAfterMs: number
}

const DEFAULT_LIMIT = 10
const DEFAULT_WINDOW_MS = 60_000

const rateLimitCache = new LRUCache<string, number>({
  max: 5000, // Maximum number of tracked identifiers
  ttl: DEFAULT_WINDOW_MS, // Fallback TTL; per-entry TTL is set explicitly
})

/**
 * Inspect the current rate-limit status for an identifier WITHOUT counting
 * this call as an attempt. Use this to gate a request before doing work.
 */
export function peekRateLimit(
  identifier: string,
  options: RateLimitOptions = {}
): RateLimitStatus {
  const { limit = DEFAULT_LIMIT } = options
  const count = rateLimitCache.get(identifier) ?? 0
  const retryAfterMs = count > 0 ? rateLimitCache.getRemainingTTL(identifier) : 0

  return {
    blocked: count >= limit,
    count,
    remaining: Math.max(0, limit - count),
    retryAfterMs: Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0,
  }
}

/**
 * Record a single attempt against an identifier and return the resulting
 * status. Uses a FIXED window: the TTL is only set when the first attempt
 * in a window is recorded, so repeated attempts cannot keep extending the
 * block indefinitely.
 */
export function recordAttempt(
  identifier: string,
  options: RateLimitOptions = {}
): RateLimitStatus {
  const { limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW_MS } = options
  const current = rateLimitCache.get(identifier) ?? 0
  const next = current + 1

  // noUpdateTTL keeps the original window; the ttl only applies to new keys.
  rateLimitCache.set(identifier, next, { ttl: windowMs, noUpdateTTL: current > 0 })

  const retryAfterMs = rateLimitCache.getRemainingTTL(identifier)

  return {
    blocked: next > limit,
    count: next,
    remaining: Math.max(0, limit - next),
    retryAfterMs: Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : windowMs,
  }
}

/**
 * Legacy check-and-increment helper. Returns true if the request is allowed.
 * Fixed-window semantics (does not extend the window on each call).
 */
export function rateLimitCheck(
  identifier: string,
  options: RateLimitOptions = {}
): boolean {
  const { limit = DEFAULT_LIMIT } = options
  const count = rateLimitCache.get(identifier) ?? 0
  if (count >= limit) {
    return false
  }
  recordAttempt(identifier, options)
  return true
}

/**
 * Get current rate limit count for an identifier.
 */
export function getRateLimitCount(identifier: string): number {
  return rateLimitCache.get(identifier) ?? 0
}

/**
 * Reset the rate limit for an identifier (e.g. after a successful login).
 */
export function resetRateLimit(identifier: string): void {
  rateLimitCache.delete(identifier)
}

/**
 * Rate limit middleware factory for API routes (legacy check-and-increment).
 */
export function createRateLimiter(options: RateLimitOptions = {}) {
  return (identifier: string): boolean => {
    return rateLimitCheck(identifier, options)
  }
}
