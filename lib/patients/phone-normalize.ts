import { phoneDigitsOnly } from '@/lib/phone-digits'

/** Normalize phone to digits comparable across formats (mirrors QR edge function matching). */
export function phoneMatchDigits(value: string | null | undefined): string {
  const digits = phoneDigitsOnly(value ?? '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  if (digits.length > 10) return digits.slice(-10)
  return digits
}

export function normalizePhoneForStorage(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const digits = phoneDigitsOnly(value)
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length > 0) return `+${digits}`
  return null
}

export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed || null
}
