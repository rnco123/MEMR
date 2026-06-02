/**
 * Request validation and security checks
 */

import { NextRequest } from 'next/server'

/**
 * Maximum request body size (5MB)
 */
const MAX_BODY_SIZE = 5 * 1024 * 1024

/**
 * Maximum URL length
 */
const MAX_URL_LENGTH = 2048

/**
 * Validate request size
 */
export function validateRequestSize(request: NextRequest): { valid: boolean; error?: string } {
  const contentLength = request.headers.get('content-length')
  
  if (contentLength) {
    const size = parseInt(contentLength, 10)
    if (size > MAX_BODY_SIZE) {
      return {
        valid: false,
        error: `Request body too large. Maximum size: ${MAX_BODY_SIZE / 1024 / 1024}MB`,
      }
    }
  }

  // Check URL length
  if (request.url.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      error: 'URL too long',
    }
  }

  return { valid: true }
}

/**
 * Validate request headers
 */
export function validateRequestHeaders(request: NextRequest): { valid: boolean; error?: string } {
  // Check for suspicious headers
  const suspiciousHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'user-agent',
  ]

  for (const header of suspiciousHeaders) {
    const value = request.headers.get(header)
    if (value && value.length > 1000) {
      return {
        valid: false,
        error: `Header ${header} is too long`,
      }
    }
  }

  return { valid: true }
}

/**
 * Check for SQL injection patterns in query parameters
 */
export function checkSqlInjection(url: string): { valid: boolean; error?: string } {
  const sqlPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /((\%27)|(\'))union/i,
    /exec(\s|\+)+(s|x)p\w+/i,
  ]

  for (const pattern of sqlPatterns) {
    if (pattern.test(url)) {
      return {
        valid: false,
        error: 'Suspicious pattern detected in request',
      }
    }
  }

  return { valid: true }
}

/**
 * Check for XSS patterns in query parameters
 */
export function checkXss(url: string): { valid: boolean; error?: string } {
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    // HTML event handlers only — avoid false positives on query keys like contactFilter=
    /(?<![a-zA-Z])on[a-zA-Z]+\s*=/gi,
    /<img[^>]+src[^>]*=.*javascript:/gi,
  ]

  for (const pattern of xssPatterns) {
    if (pattern.test(url)) {
      return {
        valid: false,
        error: 'XSS pattern detected in request',
      }
    }
  }

  return { valid: true }
}

/**
 * Comprehensive request validation
 */
export function validateRequest(request: NextRequest): { valid: boolean; error?: string } {
  // Check request size
  const sizeCheck = validateRequestSize(request)
  if (!sizeCheck.valid) {
    return sizeCheck
  }

  // Check headers
  const headerCheck = validateRequestHeaders(request)
  if (!headerCheck.valid) {
    return headerCheck
  }

  // Multipart payloads (file uploads) can contain binary sequences that trip
  // generic pattern checks. We still enforce auth/rate-limit/size elsewhere.
  const contentType = (request.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('multipart/form-data')) {
    return { valid: true }
  }

  // Only inspect URL path + query, not full absolute URL.
  const url = new URL(request.url)
  const target = `${url.pathname}${url.search}`

  // Check for SQL injection
  const sqlCheck = checkSqlInjection(target)
  if (!sqlCheck.valid) {
    return sqlCheck
  }

  // Check for XSS
  const xssCheck = checkXss(target)
  if (!xssCheck.valid) {
    return xssCheck
  }

  return { valid: true }
}
