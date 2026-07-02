/** Parse YYYY-MM-DD (or ISO prefix) as a local calendar date at noon (avoids UTC day shift). */
export function parseCalendarDate(dateString: string | null | undefined): Date | null {
  if (!dateString?.trim()) return null
  const date = new Date(`${dateString.trim().slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Format a stored calendar date (YYYY-MM-DD) without timezone conversion. */
export function formatCalendarDate(
  dateString: string | null | undefined,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = parseCalendarDate(dateString)
  if (!date) return ''
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  }).format(date)
}

/** MM/DD/YYYY-style DOB for compact lists (flowboard, search). */
export function formatDobShort(
  dateString: string | null | undefined,
  locale = 'en-US'
): string | null {
  if (!dateString?.trim()) return null
  const formatted = formatCalendarDate(dateString, locale, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
  return formatted || null
}

/** Age in whole years from a calendar DOB string. */
export function ageFromCalendarDate(dob: string | null | undefined): number | null {
  const birthDate = parseCalendarDate(dob)
  if (!birthDate) return null
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

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
