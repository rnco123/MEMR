/**
 * CSRF Protection Utilities
 * Prevents Cross-Site Request Forgery attacks
 */

import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const CSRF_TOKEN_COOKIE = 'csrf-token'
const CSRF_TOKEN_HEADER = 'x-csrf-token'
const CSRF_TOKEN_LENGTH = 32

/**
 * Generate a secure random CSRF token
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(CSRF_TOKEN_LENGTH)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < CSRF_TOKEN_LENGTH; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Set CSRF token in cookie (for server-side)
 */
export async function setCsrfToken(): Promise<string> {
  const cookieStore = await cookies()
  const token = generateCsrfToken()
  
  cookieStore.set(CSRF_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  })
  
  return token
}

/**
 * Get CSRF token from cookie
 */
export async function getCsrfToken(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(CSRF_TOKEN_COOKIE)
  return token?.value || null
}

/**
 * Validate CSRF token from request
 */
export async function validateCsrfToken(request: NextRequest): Promise<boolean> {
  // Skip CSRF for GET requests
  if (request.method === 'GET' || request.method === 'HEAD') {
    return true
  }

  const cookieToken = await getCsrfToken()
  const headerToken = request.headers.get(CSRF_TOKEN_HEADER)

  if (!cookieToken || !headerToken) {
    return false
  }

  // Use constant-time comparison to prevent timing attacks
  return constantTimeEqual(cookieToken, headerToken)
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}

/**
 * CSRF protection middleware for API routes
 */
export async function csrfProtection(request: NextRequest): Promise<Response | null> {
  const isValid = await validateCsrfToken(request)
  
  if (!isValid) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token', code: 'CSRF_ERROR' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  return null
}
