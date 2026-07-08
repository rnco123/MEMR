/**
 * Field-specific normalizers for USCIS comb/fixed-length boxes.
 * Keep values deterministic so each character lands in the right box.
 */
export function formatI693WidgetValue(key: string, raw: string): string {
  const v = raw.trim()
  if (!v) return ''

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
