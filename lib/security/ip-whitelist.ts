/**
 * IP Whitelisting for sensitive endpoints
 * Use for admin endpoints or high-security operations
 */

/**
 * Check if IP is whitelisted
 * In production, store whitelist in database or environment variables
 */
export function isIpWhitelisted(ip: string): boolean {
  // Get whitelist from environment variable
  const whitelistEnv = process.env.IP_WHITELIST
  if (!whitelistEnv) {
    // If no whitelist configured, allow all (for development)
    return process.env.NODE_ENV === 'development'
  }

  const whitelist = whitelistEnv.split(',').map((ip) => ip.trim())
  return whitelist.includes(ip)
}

/**
 * Require IP whitelist for endpoint
 */
export function requireIpWhitelist(ip: string): { allowed: boolean; error?: string } {
  if (!isIpWhitelisted(ip)) {
    return {
      allowed: false,
      error: 'Access denied from this IP address',
    }
  }

  return { allowed: true }
}
