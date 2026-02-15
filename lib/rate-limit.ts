/**
 * Rate limiting utility using LRU cache
 * Prevents abuse of API endpoints
 * 
 * Install: npm install lru-cache
 */

import { LRUCache } from 'lru-cache'

interface RateLimitOptions {
  limit?: number
  windowMs?: number
}

const rateLimitCache = new LRUCache<string, number>({
  max: 1000, // Maximum number of entries
  ttl: 60000, // Default TTL: 1 minute
})

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (e.g., IP address, user ID)
 * @param options - Rate limit options
 * @returns true if request is allowed, false if rate limited
 */
export function rateLimitCheck(
  identifier: string,
  options: RateLimitOptions = {}
): boolean {
  const { limit = 10, windowMs = 60000 } = options

  const key = identifier
  const count = rateLimitCache.get(key) || 0

  if (count >= limit) {
    return false
  }

  rateLimitCache.set(key, count + 1, { ttl: windowMs })
  return true
}

/**
 * Get current rate limit count for an identifier
 */
export function getRateLimitCount(identifier: string): number {
  return rateLimitCache.get(identifier) || 0
}

/**
 * Reset rate limit for an identifier
 */
export function resetRateLimit(identifier: string): void {
  rateLimitCache.delete(identifier)
}

/**
 * Rate limit middleware for API routes
 */
export function createRateLimiter(options: RateLimitOptions = {}) {
  return (identifier: string): boolean => {
    return rateLimitCheck(identifier, options)
  }
}
