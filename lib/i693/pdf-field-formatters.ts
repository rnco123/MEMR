/** Applicant phone fields that should carry the US country code on the form. */
const AUTO_US_COUNTRY_CODE_KEYS = new Set([
  'applicant_contact.day_phone',
  'applicant_contact.mobile_phone',
])

/**
 * Ensure a US 10-digit number is written with a leading "+1". Idempotent, and
 * leaves anything already carrying a "+" country code or a partial entry as-is.
 */
export function withUsCountryCode(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.startsWith('+')) return trimmed
  const digits = trimmed.replace(/\D+/g, '')
  if (digits.length === 10) return `+1 ${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+1 ${digits.slice(1)}`
  return trimmed
}

/**
 * Field-specific normalizers for USCIS comb/fixed-length boxes.
 * Keep values deterministic so each character lands in the right box.
 */
export function formatI693WidgetValue(key: string, raw: string): string {
  const v = raw.trim()
  if (!v) return ''

  if (AUTO_US_COUNTRY_CODE_KEYS.has(key)) {
    return withUsCountryCode(v)
  }

  if (key === 'applicant.a_number') {
    // PDF already prints "A-" prefix; only digits belong in comb cells.
    return v.replace(/^A[-\s]*/i, '').replace(/\D+/g, '').slice(0, 9)
  }

  if (key === 'applicant.uscis_online_account') {
    // 12 USCIS account cells on current template.
    return v.replace(/[^0-9A-Za-z]+/g, '').toUpperCase().slice(0, 12)
  }

  if (key === 'uscis_records.receipt_number') {
    // Receipt number box sets are fixed-size on multiple pages.
    return v.replace(/[^0-9A-Za-z]+/g, '').toUpperCase().slice(0, 13)
  }

  return v
}
