export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number]

export type DayHours = {
  closed: boolean
  start: string
  end: string
}

export type WeeklyHours = Record<WeekdayKey, DayHours>

export const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  mon: { closed: false, start: '09:00', end: '17:00' },
  tue: { closed: false, start: '09:00', end: '17:00' },
  wed: { closed: false, start: '09:00', end: '17:00' },
  thu: { closed: false, start: '09:00', end: '17:00' },
  fri: { closed: false, start: '09:00', end: '17:00' },
  sat: { closed: true, start: '09:00', end: '13:00' },
  sun: { closed: true, start: '09:00', end: '13:00' },
}

const HOURS_JSON_VERSION = 1

function cloneWeeklyHours(source: WeeklyHours): WeeklyHours {
  return WEEKDAY_KEYS.reduce((acc, key) => {
    acc[key] = { ...source[key] }
    return acc
  }, {} as WeeklyHours)
}

function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
}

function normalizeDayHours(raw: unknown, fallback: DayHours): DayHours {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const row = raw as Record<string, unknown>
  const closed = row.closed === true
  const start = isValidTime(row.start) ? row.start : fallback.start
  const end = isValidTime(row.end) ? row.end : fallback.end
  return { closed, start, end }
}

export function parseOpeningHours(raw: string | null | undefined): WeeklyHours {
  const text = (raw ?? '').trim()
  if (!text) return cloneWeeklyHours(DEFAULT_WEEKLY_HOURS)

  try {
    const parsed = JSON.parse(text) as {
      v?: number
      days?: Partial<Record<WeekdayKey, unknown>>
    }
    if (parsed?.v === HOURS_JSON_VERSION && parsed.days && typeof parsed.days === 'object') {
      return WEEKDAY_KEYS.reduce((acc, key) => {
        acc[key] = normalizeDayHours(parsed.days?.[key], DEFAULT_WEEKLY_HOURS[key])
        return acc
      }, {} as WeeklyHours)
    }
  } catch {
    // Legacy plain-text hours — start from defaults; display still uses raw text.
  }

  return cloneWeeklyHours(DEFAULT_WEEKLY_HOURS)
}

export function serializeOpeningHours(schedule: WeeklyHours): string | null {
  const hasOpenDay = WEEKDAY_KEYS.some((key) => !schedule[key].closed)
  if (!hasOpenDay) return null

  return JSON.stringify({
    v: HOURS_JSON_VERSION,
    days: schedule,
  })
}

export function isStructuredOpeningHours(raw: string | null | undefined): boolean {
  const text = (raw ?? '').trim()
  if (!text) return false
  try {
    const parsed = JSON.parse(text) as { v?: number; days?: unknown }
    return parsed?.v === HOURS_JSON_VERSION && typeof parsed.days === 'object'
  } catch {
    return false
  }
}

function formatTime12h(time24: string): string {
  const [hourText, minuteText] = time24.split(':')
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time24
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

function dayRangeLabel(keys: WeekdayKey[], dayLabels: Record<WeekdayKey, string>): string {
  if (keys.length === 1) return dayLabels[keys[0]!]
  if (keys.length === 7) return dayLabels.mon === 'Mon' ? 'Mon–Sun' : `${dayLabels.mon}–${dayLabels.sun}`

  const indexes = keys.map((key) => WEEKDAY_KEYS.indexOf(key)).sort((a, b) => a - b)
  const isContiguous = indexes.every((value, index) => index === 0 || value === indexes[index - 1]! + 1)
  if (isContiguous) {
    return `${dayLabels[keys[0]!]}–${dayLabels[keys[keys.length - 1]!]}`
  }

  return keys.map((key) => dayLabels[key]).join(', ')
}

type FormatLabels = {
  days: Record<WeekdayKey, string>
  closed: string
}

export function formatOpeningHoursDisplay(
  raw: string | null | undefined,
  labels: FormatLabels
): string | null {
  const text = (raw ?? '').trim()
  if (!text) return null

  if (!isStructuredOpeningHours(text)) return text

  const schedule = parseOpeningHours(text)
  const openSegments: Array<{ keys: WeekdayKey[]; start: string; end: string }> = []
  const closedSegments: WeekdayKey[][] = []

  let currentOpen: { keys: WeekdayKey[]; start: string; end: string } | null = null
  let currentClosed: WeekdayKey[] = []

  const flushOpen = () => {
    if (currentOpen) openSegments.push(currentOpen)
    currentOpen = null
  }
  const flushClosed = () => {
    if (currentClosed.length > 0) closedSegments.push([...currentClosed])
    currentClosed = []
  }

  for (const key of WEEKDAY_KEYS) {
    const day = schedule[key]
    if (day.closed) {
      flushOpen()
      currentClosed.push(key)
      continue
    }

    flushClosed()
    if (
      currentOpen &&
      currentOpen.start === day.start &&
      currentOpen.end === day.end
    ) {
      currentOpen.keys.push(key)
    } else {
      flushOpen()
      currentOpen = { keys: [key], start: day.start, end: day.end }
    }
  }
  flushOpen()
  flushClosed()

  const parts: string[] = []
  for (const segment of openSegments) {
    const range = dayRangeLabel(segment.keys, labels.days)
    parts.push(
      `${range} ${formatTime12h(segment.start)} – ${formatTime12h(segment.end)}`
    )
  }

  const allClosed = WEEKDAY_KEYS.every((key) => schedule[key].closed)
  if (allClosed) return labels.closed

  return parts.join(' · ')
}

export function copyDayToWeekdays(schedule: WeeklyHours, source: WeekdayKey = 'mon'): WeeklyHours {
  const next = cloneWeeklyHours(schedule)
  const template = { ...next[source] }
  for (const key of ['tue', 'wed', 'thu', 'fri'] as WeekdayKey[]) {
    next[key] = { ...template }
  }
  return next
}

export function copyDayToAll(schedule: WeeklyHours, source: WeekdayKey = 'mon'): WeeklyHours {
  const next = cloneWeeklyHours(schedule)
  const template = { ...next[source] }
  for (const key of WEEKDAY_KEYS) {
    next[key] = { ...template }
  }
  return next
}

export function applyStandardWeekPreset(): WeeklyHours {
  return cloneWeeklyHours(DEFAULT_WEEKLY_HOURS)
}
