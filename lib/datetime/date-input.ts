/** Local calendar date as YYYY-MM-DD (for `<input type="date">`). */
export function todayLocalIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Normalize stored DOB / date strings to YYYY-MM-DD for date inputs. */
export function toDateInputValue(dateString: string | null | undefined): string {
  if (!dateString?.trim()) return ''
  const trimmed = dateString.trim()

  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
  const isoDate = isoPrefix?.[1]
  if (isoDate) return isoDate

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const month = slash[1]
    const day = slash[2]
    const year = slash[3]
    if (month && day && year) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
  }

  const parsed = new Date(`${trimmed.slice(0, 10)}T12:00:00`)
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const day = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  return ''
}
