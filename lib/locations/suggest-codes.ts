export function suggestNextTenantCode(existing: { tenant_code: string }[]): string {
  let maxNumeric = 0
  for (const row of existing) {
    const code = row.tenant_code.trim()
    if (/^\d+$/.test(code)) {
      const value = Number(code)
      if (value > maxNumeric) maxNumeric = value
    }
  }
  return String(maxNumeric > 0 ? maxNumeric + 1 : existing.length + 1)
}

export function suggestLocationCode(title: string): string {
  const words = title
    .trim()
    .split(/[\s,./-]+/)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)

  if (words.length === 0) return ''

  if (words.length === 1) {
    return words[0]!.slice(0, 8).toUpperCase()
  }

  const initials = words.map((word) => word[0]!.toUpperCase()).join('')
  if (initials.length >= 2) return initials.slice(0, 8)

  return words[0]!.slice(0, 8).toUpperCase()
}
