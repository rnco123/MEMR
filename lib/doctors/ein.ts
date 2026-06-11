/** Normalize optional EIN input to XX-XXXXXXX or null when empty. */
export function parseDoctorEin(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length !== 9) {
    throw new Error('EIN must be 9 digits (e.g. 12-3456789)')
  }

  return `${digits.slice(0, 2)}-${digits.slice(2)}`
}
