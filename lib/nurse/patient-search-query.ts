/** Sanitize free-text for PostgREST `.or()` — commas break the filter syntax. */
export function sanitizePatientSearchTerm(raw: string): string {
  return raw.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Try to parse a human date (e.g. "April 9, 1997") to YYYY-MM-DD. */
export function parseSearchDateToIso(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  if (y < 1900 || y > 2100) return null
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
