/**
 * Password strength validation and utilities
 */

import { z } from 'zod'

export interface PasswordStrength {
  score: number // 0-4
  feedback: string[]
  isStrong: boolean
}

/**
 * Password strength requirements
 */
const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  maxLength: 128,
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = []
  let score = 0

  // Length check
  if (password.length >= PASSWORD_REQUIREMENTS.minLength) {
    score++
  } else {
    feedback.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`)
  }

  if (password.length >= 12) {
    score++
  }

  // Uppercase check
  if (/[A-Z]/.test(password)) {
    score++
  } else if (PASSWORD_REQUIREMENTS.requireUppercase) {
    feedback.push('Password must contain at least one uppercase letter')
  }

  // Lowercase check
  if (/[a-z]/.test(password)) {
    score++
  } else if (PASSWORD_REQUIREMENTS.requireLowercase) {
    feedback.push('Password must contain at least one lowercase letter')
  }

  // Number check
  if (/[0-9]/.test(password)) {
    score++
  } else if (PASSWORD_REQUIREMENTS.requireNumbers) {
    feedback.push('Password must contain at least one number')
  }

  // Special character check
  if (/[^A-Za-z0-9]/.test(password)) {
    score++
  } else if (PASSWORD_REQUIREMENTS.requireSpecialChars) {
    feedback.push('Password must contain at least one special character')
  }

  // Check for common patterns
  const commonPatterns = [
    /12345/,
    /password/i,
    /qwerty/i,
    /admin/i,
    /letmein/i,
  ]

  const hasCommonPattern = commonPatterns.some((pattern) => pattern.test(password))
  if (hasCommonPattern) {
    feedback.push('Password contains common patterns that are easy to guess')
    score = Math.max(0, score - 1)
  }

  // Check for repeated characters
  if (/(.)\1{2,}/.test(password)) {
    feedback.push('Password contains too many repeated characters')
    score = Math.max(0, score - 1)
  }

  return {
    score: Math.min(4, Math.max(0, score)),
    feedback,
    isStrong: score >= 3 && password.length >= PASSWORD_REQUIREMENTS.minLength,
  }
}

/**
 * Zod schema for password validation
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_REQUIREMENTS.minLength, `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`)
  .max(PASSWORD_REQUIREMENTS.maxLength, `Password must be less than ${PASSWORD_REQUIREMENTS.maxLength} characters`)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
  .refine(
    (password) => {
      const strength = validatePasswordStrength(password)
      return strength.isStrong
    },
    {
      message: 'Password is too weak. Please use a stronger password.',
    }
  )

/**
 * Check if password is in common password list
 * In production, use a more comprehensive list
 */
const COMMON_PASSWORDS = [
  'password',
  '12345678',
  'password123',
  'admin123',
  'letmein',
  'welcome',
  'monkey',
  '1234567890',
  'qwerty123',
]

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.includes(password.toLowerCase())
}
