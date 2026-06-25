import type { Language } from '@/lib/i18n'

/** Clinic display timezone — values are stored in UTC (TIMESTAMPTZ / ISO strings). */
export const CLINIC_TIME_ZONE = 'America/Chicago'

/** Suffix shown after clinic-local clock times in the UI. */
export const CLINIC_TIME_ZONE_LABEL = 'CT'

export function clinicLocale(language: Language): string {
  return language === 'es' ? 'es-US' : 'en-US'
}

function appendCtSuffix(formatted: string, append = true): string {
  if (!formatted) return ''
  if (!append) return formatted
  return `${formatted} ${CLINIC_TIME_ZONE_LABEL}`
}

export type FormatClinicDateTimeOptions = {
  dateStyle?: Intl.DateTimeFormatOptions['dateStyle']
  timeStyle?: Intl.DateTimeFormatOptions['timeStyle']
  /** Append " CT" after the formatted value (default true). */
  appendCt?: boolean
  /** Full Intl.DateTimeFormat options (timeZone is always Central). */
  intl?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>
}

/**
 * Format a UTC timestamp for UI display in US Central Time.
 */
export function formatClinicDateTime(
  value: string | Date | null | undefined,
  locale: string,
  options?: FormatClinicDateTimeOptions
): string {
  if (value == null || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : ''

  const { appendCt = true, dateStyle = 'medium', timeStyle = 'short', intl } = options ?? {}
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone: CLINIC_TIME_ZONE,
    ...(intl ?? { dateStyle, timeStyle }),
  }).format(date)

  return appendCtSuffix(formatted, appendCt)
}

export function formatClinicDateTimeForLanguage(
  value: string | Date | null | undefined,
  language: Language,
  options?: FormatClinicDateTimeOptions
): string {
  return formatClinicDateTime(value, clinicLocale(language), options)
}

/** Calendar date (YYYY-MM-DD) without timezone conversion. */
export function formatClinicDateOnly(
  dateString: string | null | undefined,
  language: Language,
  options?: Pick<Intl.DateTimeFormatOptions, 'weekday' | 'year' | 'month' | 'day'>
): string {
  if (!dateString?.trim()) return ''
  const date = new Date(`${dateString.trim().slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(clinicLocale(language), {
    year: 'numeric',
    month: options?.month ?? 'short',
    day: 'numeric',
    ...(options?.weekday ? { weekday: options.weekday } : {}),
  }).format(date)
}

/**
 * HH:MM[:SS] appointment slot stored as clinic-local clock time → "2:30 PM CT".
 */
export function formatClinicTimeSlot(timeString: string | null | undefined): string {
  if (!timeString?.trim()) return ''
  const parts = timeString.trim().split(':')
  if (parts.length < 2 || !parts[0] || !parts[1]) return ''
  const hours = parseInt(parts[0], 10)
  const minutes = parts[1]
  if (Number.isNaN(hours)) return ''
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return appendCtSuffix(`${displayHours}:${minutes} ${ampm}`)
}

function centralDayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(d)
}

/** YYYY-MM-DD for the current calendar day in clinic (Central) time. */
export function getClinicTodayDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function centralTimeOnly(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: CLINIC_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

/** Relative chat timestamps; absolute portions use Central Time with CT suffix. */
export function formatClinicChatTime(dateString: string, language: Language = 'en'): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''
  const locale = clinicLocale(language)
  const now = new Date()
  const dateDay = centralDayKey(date)
  const nowDay = centralDayKey(now)
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  const timeLabel = appendCtSuffix(centralTimeOnly(date, locale))

  if (dateDay === nowDay) {
    if (minutes < 1) return `Just now (${timeLabel})`
    if (minutes < 60) return `${timeLabel} (${minutes}m ago)`
    return timeLabel
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (dateDay === centralDayKey(yesterday)) {
    return `Yesterday ${timeLabel}`
  }

  if (days < 7) {
    const dayStr = date.toLocaleDateString(locale, { timeZone: CLINIC_TIME_ZONE, weekday: 'short' })
    return `${dayStr} ${timeLabel}`
  }

  const dateStr = date.toLocaleDateString(locale, {
    timeZone: CLINIC_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year:
      new Intl.DateTimeFormat(locale, { timeZone: CLINIC_TIME_ZONE, year: 'numeric' }).format(date) !==
      new Intl.DateTimeFormat(locale, { timeZone: CLINIC_TIME_ZONE, year: 'numeric' }).format(now)
        ? 'numeric'
        : undefined,
  })
  return `${dateStr} ${timeLabel}`
}
