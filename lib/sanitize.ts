/**
 * Input sanitization utilities
 */

/**
 * Sanitize HTML content (for rich text fields)
 * Note: For production, install isomorphic-dompurify: npm install isomorphic-dompurify
 */
export function sanitizeHtml(html: string): string {
  // Basic HTML sanitization - remove script tags and dangerous attributes
  // For production, use DOMPurify: import DOMPurify from 'isomorphic-dompurify'
  // return DOMPurify.sanitize(html)
  
  // Basic implementation for now
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '')
}

/**
 * Sanitize plain text input
 */
export function sanitizeText(text: string): string {
  if (typeof text !== 'string') {
    return ''
  }
  
  return text
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .slice(0, 10000) // Limit length
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string {
  if (typeof email !== 'string') {
    return ''
  }
  
  return email
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9@._-]/g, '')
    .slice(0, 255)
}

/**
 * Sanitize phone number
 */
export function sanitizePhone(phone: string): string {
  if (typeof phone !== 'string') {
    return ''
  }
  
  // Remove all non-digit characters except + at the start
  return phone
    .trim()
    .replace(/^\+/, '+')
    .replace(/[^\d+]/g, '')
    .slice(0, 20)
}

/**
 * Sanitize file name
 */
export function sanitizeFileName(fileName: string): string {
  if (typeof fileName !== 'string') {
    return 'file'
  }
  
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 255)
}

/**
 * Sanitize URL
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') {
    return ''
  }
  
  try {
    const parsed = new URL(url)
    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return ''
    }
    return parsed.toString()
  } catch {
    return ''
  }
}
