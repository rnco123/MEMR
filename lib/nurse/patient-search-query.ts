/** Sanitize free-text for PostgREST `.or()` — commas break the filter syntax. */
export function sanitizePatientSearchTerm(raw: string): string {
  return raw.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

export type SearchDateParts = {
  year: string
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
  return MONTH_NAME_TO_NUMBER[key] ?? null
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

/** Full DOB match as YYYY-MM-DD when month and day are present. */
export function parseSearchDateToIso(raw: string): string | null {
  const parts = parseSearchDateParts(raw)
  if (!parts?.month || !parts.day) return null
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
  year: string,
  month = '',
  day = ''
): { eq?: string; gte?: string; lte?: string } | null {
  if (!year) return null
  const resolvedMonth = month ? resolveMonthToken(month) : null
  if (month && !resolvedMonth) return null
  const monthValue = resolvedMonth ?? ''
  if (monthValue && day) {
    return {
      eq: `${year}-${monthValue.padStart(2, '0')}-${day.padStart(2, '0')}`,
    }
  }
  if (monthValue) {
    const lastDay = new Date(Number(year), Number(monthValue), 0).getDate()
    return {
      gte: `${year}-${monthValue.padStart(2, '0')}-01`,
      lte: `${year}-${monthValue.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    }
  }
  return { gte: `${year}-01-01`, lte: `${year}-12-31` }
}

export function buildDobFilterFromSearch(raw: string): { eq?: string; gte?: string; lte?: string } | null {
  const parts = parseSearchDateParts(raw.trim())
  if (!parts) return null
  return buildPatientDobFilter(parts.year, parts.month ?? '', parts.day ?? '')
}
