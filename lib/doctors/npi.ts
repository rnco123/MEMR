/** Normalize optional NPI input to 10 digits or null when empty. */
export function parseDoctorNpi(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length !== 10) {
    throw new Error('NPI must be 10 digits (e.g. 1234567890)')
  }

  return digits
}
