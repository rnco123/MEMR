/**
 * Security monitoring and threat detection
 */

import { logAuditEvent } from '@/lib/audit-server'

export interface SecurityEvent {
  type: 'suspicious_activity' | 'failed_login' | 'rate_limit' | 'invalid_request' | 'unauthorized_access'
  severity: 'low' | 'medium' | 'high' | 'critical'
  details: Record<string, any>
  ipAddress?: string
  userId?: string
}

/**
 * Log security event
 */
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    // Log to audit table
    await logAuditEvent(
      'security_event' as any,
      'system',
      undefined,
      {
        type: event.type,
        severity: event.severity,
        details: event.details,
        ip_address: event.ipAddress,
        user_id: event.userId,
      }
    )

    // In production, also send to security monitoring service
    if (process.env.NODE_ENV === 'production' && event.severity === 'critical') {
      // Send alert to security team
      // Example: send to PagerDuty, Slack, etc.
      // In development, log to console
      if (process.env.NODE_ENV !== 'production') {
        console.error('CRITICAL SECURITY EVENT:', event)
      }
    }
  } catch (error) {
    // Don't throw - security logging should never break the app
    if (process.env.NODE_ENV === 'development') {
      console.error('Error logging security event:', error)
    }
  }
}

/**
 * Detect suspicious activity patterns
 */
export function detectSuspiciousActivity(
  _ipAddress: string,
  _userId: string | undefined,
  action: string
): boolean {
  // Patterns that indicate suspicious activity
  const suspiciousPatterns = [
    // Multiple failed logins
    action === 'failed_login',
    // Rapid API calls
    action === 'rapid_requests',
    // Access from unusual location (would need geolocation data)
    // Unusual time patterns
  ]

  return suspiciousPatterns.some((pattern) => pattern === true)
}

/**
 * Check for brute force attack
 */
export async function checkBruteForce(
  _identifier: string,
  _action: string
): Promise<{ isBruteForce: boolean; remainingAttempts: number }> {
  // This would integrate with rate limiting
  // Check for multiple failed attempts in short time (15 min window)
  const maxAttempts = 5

  // In a real implementation, check against database or cache
  // For now, return false (would need to implement attempt tracking)
  return {
    isBruteForce: false,
    remainingAttempts: maxAttempts,
  }
}
