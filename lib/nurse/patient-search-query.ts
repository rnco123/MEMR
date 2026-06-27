import type { PatientSearchDobFilter } from '@/lib/nurse/patient-search-types'

/** Sanitize free-text for PostgREST `.or()` — commas break the filter syntax. */
export function sanitizePatientSearchTerm(raw: string): string {
  return raw.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

export type SearchDateParts = {
  year?: string
  month?: string
  day?: string
}

const DATE_SEP = String.raw`\s*[/\-.]\s*`

const MONTH_NAME_TO_NUMBER: Record<string, string> = {
  jan: '01',
  january: '01',
  ene: '01',
  enero: '01',
  feb: '02',
  february: '02',
  febrero: '02',
  mar: '03',
  march: '03',
  marzo: '03',
  apr: '04',
  april: '04',
  abr: '04',
  abril: '04',
  may: '05',
  mayo: '05',
  jun: '06',
  june: '06',
  junio: '06',
  jul: '07',
  july: '07',
  julio: '07',
  aug: '08',
  august: '08',
  ago: '08',
  agosto: '08',
  sep: '09',
  sept: '09',
  september: '09',
  septiembre: '09',
  setiembre: '09',
  oct: '10',
  october: '10',
  octubre: '10',
  nov: '11',
  november: '11',
  noviembre: '11',
  dec: '12',
  december: '12',
  diciembre: '12',
}

/** Normalize month token (number, full name, or abbreviation) to two-digit month. */
export function resolveMonthToken(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/^\d{1,2}$/.test(trimmed)) {
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n < 1 || n > 12) return null
    return String(n).padStart(2, '0')
  }

  const key = trimmed.toLowerCase().replace(/\./g, '')
  const exact = MONTH_NAME_TO_NUMBER[key]
  if (exact) return exact

  // Prefix match for partial typing (e.g. "jun", "juner" → June).
  if (key.length >= 3) {
    const prefix = key.slice(0, 3)
    const matchedNumbers = new Set<string>()
    for (const [name, num] of Object.entries(MONTH_NAME_TO_NUMBER)) {
      if (name.startsWith(prefix) || key.startsWith(name.slice(0, Math.min(key.length, name.length)))) {
        matchedNumbers.add(num)
      }
    }
    if (matchedNumbers.size === 1) return [...matchedNumbers][0]!
    if (matchedNumbers.size > 1) {
      const nums = [...matchedNumbers]
      if (nums.every((n) => n === nums[0])) return nums[0]!
    }
  }

  return null
}

function parseNamedMonthDate(trimmed: string): SearchDateParts | null {
  const dayMonthYear = trimmed.match(
    new RegExp(`^(\\d{1,2})${DATE_SEP}([a-zA-Z\u00C0-\u024F]+)${DATE_SEP}(\\d{2,4})$`, 'i')
  )
  if (dayMonthYear) {
    const month = resolveMonthToken(dayMonthYear[2] ?? '')
    if (!month) return null
    return normalizeDateParts(
      expandTwoDigitYear(dayMonthYear[3] ?? ''),
      month,
      dayMonthYear[1] ?? ''
    )
  }

  const monthDayYear = trimmed.match(
    new RegExp(`^([a-zA-Z\u00C0-\u024F]+)${DATE_SEP}(\\d{1,2})${DATE_SEP}(\\d{2,4})$`, 'i')
  )
  if (monthDayYear) {
    const month = resolveMonthToken(monthDayYear[1] ?? '')
    if (!month) return null
    return normalizeDateParts(
      expandTwoDigitYear(monthDayYear[3] ?? ''),
      month,
      monthDayYear[2] ?? ''
    )
  }

  const dayMonthYearSpaced = trimmed.match(/^(\d{1,2})\s+([a-zA-Z\u00C0-\u024F]+)\s+(\d{2,4})$/i)
  if (dayMonthYearSpaced) {
    const month = resolveMonthToken(dayMonthYearSpaced[2] ?? '')
    if (!month) return null
    return normalizeDateParts(
      expandTwoDigitYear(dayMonthYearSpaced[3] ?? ''),
      month,
      dayMonthYearSpaced[1] ?? ''
    )
  }

  const monthDayYearSpaced = trimmed.match(/^([a-zA-Z\u00C0-\u024F]+)\s+(\d{1,2}),?\s+(\d{2,4})$/i)
  if (monthDayYearSpaced) {
    const month = resolveMonthToken(monthDayYearSpaced[1] ?? '')
    if (!month) return null
    return normalizeDateParts(
      expandTwoDigitYear(monthDayYearSpaced[3] ?? ''),
      month,
      monthDayYearSpaced[2] ?? ''
    )
  }

  return null
}

function isValidYear(year: string): boolean {
  const y = Number(year)
  return Number.isFinite(y) && y >= 1900 && y <= 2100
}

function expandTwoDigitYear(year: string): string {
  if (year.length !== 2) return year
  const n = Number(year)
  if (!Number.isFinite(n)) return year
  return n >= 30 ? `19${year.padStart(2, '0')}` : `20${year.padStart(2, '0')}`
}

function normalizeDateParts(
  year: string,
  month?: string,
  day?: string
): SearchDateParts | null {
  const expandedYear = expandTwoDigitYear(year)
  if (!isValidYear(expandedYear)) return null
  if (month) {
    const resolvedMonth = resolveMonthToken(month)
    if (!resolvedMonth) return null
    const m = Number(resolvedMonth)
    if (!Number.isFinite(m) || m < 1 || m > 12) return null
    month = resolvedMonth
  }
  if (day) {
    const d = Number(day)
    if (!Number.isFinite(d) || d < 1 || d > 31) return null
  }
  return {
    year: expandedYear,
    month: month ? month.padStart(2, '0') : undefined,
    day: day ? String(Number(day)).padStart(2, '0') : undefined,
  }
}

function parseSlashSeparatedDate(trimmed: string): SearchDateParts | null {
  const slashDate = trimmed.match(
    new RegExp(`^(\\d{1,2})${DATE_SEP}(\\d{1,2})${DATE_SEP}(\\d{2,4})$`)
  )
  if (!slashDate) return null

  const first = Number(slashDate[1])
  const second = Number(slashDate[2])
  const year = expandTwoDigitYear(slashDate[3] ?? '')

  if (first > 12 && second <= 12) {
    return normalizeDateParts(year, String(second), String(first))
  }
  if (second > 12 && first <= 12) {
    return normalizeDateParts(year, String(first), String(second))
  }
  return normalizeDateParts(year, String(first), String(second))
}

function parseWithNativeDate(trimmed: string): SearchDateParts | null {
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  const year = String(parsed.getFullYear())
  if (!isValidYear(year)) return null
  return normalizeDateParts(
    year,
    String(parsed.getMonth() + 1),
    String(parsed.getDate())
  )
}

/** Month name or day+month without year (e.g. "june", "15 june"). */
function parsePartialNamedMonthDate(trimmed: string): SearchDateParts | null {
  const dayMonthSpaced = trimmed.match(/^(\d{1,2})\s+([a-zA-Z\u00C0-\u024F]+)$/i)
  if (dayMonthSpaced) {
    const month = resolveMonthToken(dayMonthSpaced[2] ?? '')
    const dayNum = Number(dayMonthSpaced[1])
    if (month && Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31) {
      return { month, day: String(dayNum).padStart(2, '0') }
    }
  }

  const monthDaySpaced = trimmed.match(/^([a-zA-Z\u00C0-\u024F]+)\s+(\d{1,2})$/i)
  if (monthDaySpaced) {
    const month = resolveMonthToken(monthDaySpaced[1] ?? '')
    const dayNum = Number(monthDaySpaced[2])
    if (month && Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31) {
      return { month, day: String(dayNum).padStart(2, '0') }
    }
  }

  const dayMonthSep = trimmed.match(
    new RegExp(`^(\\d{1,2})${DATE_SEP}([a-zA-Z\u00C0-\u024F]+)$`, 'i')
  )
  if (dayMonthSep) {
    const month = resolveMonthToken(dayMonthSep[2] ?? '')
    const dayNum = Number(dayMonthSep[1])
    if (month && Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31) {
      return { month, day: String(dayNum).padStart(2, '0') }
    }
  }

  const monthDaySep = trimmed.match(
    new RegExp(`^([a-zA-Z\u00C0-\u024F]+)${DATE_SEP}(\\d{1,2})$`, 'i')
  )
  if (monthDaySep) {
    const month = resolveMonthToken(monthDaySep[1] ?? '')
    const dayNum = Number(monthDaySep[2])
    if (month && Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31) {
      return { month, day: String(dayNum).padStart(2, '0') }
    }
  }

  const monthOnly = trimmed.match(/^([a-zA-Z\u00C0-\u024F]+)$/i)
  if (monthOnly) {
    const month = resolveMonthToken(monthOnly[1] ?? '')
    if (month) return { month }
  }

  return null
}

/** Parse free-text into year/month/day parts for DOB search (supports many formats). */
export function parseSearchDateParts(raw: string): SearchDateParts | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/^\d{4}$/.test(trimmed)) {
    return normalizeDateParts(trimmed)
  }

  const iso = trimmed.match(new RegExp(`^(\\d{4})${DATE_SEP}(\\d{1,2})(?:${DATE_SEP}(\\d{1,2}))?$`))
  if (iso) {
    return normalizeDateParts(iso[1] ?? '', iso[2], iso[3])
  }

  const monthYear = trimmed.match(new RegExp(`^(\\d{1,2})${DATE_SEP}(\\d{2,4})$`))
  if (monthYear) {
    return normalizeDateParts(expandTwoDigitYear(monthYear[2] ?? ''), monthYear[1])
  }

  const slashParsed = parseSlashSeparatedDate(trimmed)
  if (slashParsed) return slashParsed

  const isoCompact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (isoCompact && isValidYear(isoCompact[1] ?? '')) {
    const parsed = normalizeDateParts(isoCompact[1] ?? '', isoCompact[2], isoCompact[3])
    if (parsed) return parsed
  }

  const compactMdy = trimmed.match(/^(\d{1,2})(\d{2})(\d{4})$/)
  if (compactMdy) {
    return normalizeDateParts(compactMdy[3] ?? '', compactMdy[1], compactMdy[2])
  }

  const compact = trimmed.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (compact) {
    return normalizeDateParts(compact[3] ?? '', compact[1], compact[2])
  }

  const namedMonthParsed = parseNamedMonthDate(trimmed)
  if (namedMonthParsed) return namedMonthParsed

  const partialNamed = parsePartialNamedMonthDate(trimmed)
  if (partialNamed) return partialNamed

  if (/\d/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) {
    return parseWithNativeDate(trimmed)
  }

  if (
    new RegExp(`^\\d{1,2}${DATE_SEP}\\d{1,2}${DATE_SEP}\\d{2,4}$`).test(trimmed) ||
    /^[a-zA-Z]+\s+\d/.test(trimmed)
  ) {
    return parseWithNativeDate(trimmed)
  }

  return null
}

/** Full DOB match as YYYY-MM-DD when year, month, and day are present. */
export function parseSearchDateToIso(raw: string): string | null {
  const parts = parseSearchDateParts(raw)
  if (!parts?.year || !parts.month || !parts.day) return null
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function looksLikeDateSearchInput(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false
  if (parseSearchDateParts(trimmed)) return true
  if (/^\d{4}$/.test(trimmed)) return true
  if (new RegExp(`^\\d{1,2}${DATE_SEP}\\d{1,2}(${DATE_SEP}\\d{0,4})?$`).test(trimmed)) return true
  if (new RegExp(`^\\d{1,2}${DATE_SEP}\\d{2,4}$`).test(trimmed)) return true
  if (/^(\d{1,2})(\d{2})(\d{0,4})$/.test(trimmed)) return true
  if (/^(\d{4})(\d{2})(\d{2})$/.test(trimmed)) return true
  if (/^[a-zA-Z\u00C0-\u024F]+\s+\d/.test(trimmed)) return true
  if (/^\d{1,2}\s+[a-zA-Z\u00C0-\u024F]+\s+\d/.test(trimmed)) return true
  if (
    new RegExp(`^\\d{1,2}${DATE_SEP}[a-zA-Z\u00C0-\u024F]+${DATE_SEP}\\d`, 'i').test(trimmed) ||
    new RegExp(`^[a-zA-Z\u00C0-\u024F]+${DATE_SEP}\\d{1,2}${DATE_SEP}\\d`, 'i').test(trimmed)
  ) {
    return true
  }
  return false
}

export function buildPatientDobFilter(
  year = '',
  month = '',
  day = ''
): PatientSearchDobFilter | null {
  const resolvedMonth = month ? resolveMonthToken(month) : null
  if (month && !resolvedMonth) return null
  const monthValue = resolvedMonth ?? ''
  const dayValue =
    day && Number(day) >= 1 && Number(day) <= 31 ? String(Number(day)).padStart(2, '0') : ''

  if (!year && monthValue && dayValue) {
    return { anyYearMonthDay: { month: monthValue, day: dayValue } }
  }
  if (!year && monthValue) {
    return { anyYearMonth: monthValue }
  }
  if (!year) return null

  if (monthValue && dayValue) {
    return {
      eq: `${year}-${monthValue}-${dayValue}`,
    }
  }
  if (monthValue) {
    const lastDay = new Date(Number(year), Number(monthValue), 0).getDate()
    return {
      gte: `${year}-${monthValue}-01`,
      lte: `${year}-${monthValue}-${String(lastDay).padStart(2, '0')}`,
    }
  }
  return { gte: `${year}-01-01`, lte: `${year}-12-31` }
}

export function buildDobFilterFromSearch(raw: string): PatientSearchDobFilter | null {
  const parts = parseSearchDateParts(raw.trim())
  if (!parts) return null
  return buildPatientDobFilter(parts.year ?? '', parts.month ?? '', parts.day ?? '')
}

export function isPartialDobFilter(filter: PatientSearchDobFilter | null | undefined): boolean {
  return Boolean(filter?.anyYearMonth || filter?.anyYearMonthDay)
}
