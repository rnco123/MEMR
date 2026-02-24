'use client'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1919 }, (_, i) => CURRENT_YEAR - i) // 1920..current
const MONTHS = [
  { value: '', label: 'Month' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, '0'),
    label: new Date(2000, i, 1).toLocaleString('en-US', { month: 'short' }),
  })),
]
const DAYS = [
  { value: '', label: 'Day' },
  ...Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1).padStart(2, '0'),
    label: String(i + 1),
  })),
]

export interface SearchByDobDropdownsProps {
  year: string
  month: string
  day: string
  onYearChange: (value: string) => void
  onMonthChange: (value: string) => void
  onDayChange: (value: string) => void
  className?: string
}

export function SearchByDobDropdowns({
  year,
  month,
  day,
  onYearChange,
  onMonthChange,
  onDayChange,
  className = '',
}: SearchByDobDropdownsProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-blue-200 text-sm whitespace-nowrap font-medium">
        Search by DOB
      </span>
      <select
        value={year}
        onChange={(e) => onYearChange(e.target.value)}
        className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none cursor-pointer min-w-[4.5rem]"
        aria-label="Year"
      >
        <option value="">Year</option>
        {YEARS.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => onMonthChange(e.target.value)}
        className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none cursor-pointer min-w-[5rem]"
        aria-label="Month"
      >
        {MONTHS.map((m) => (
          <option key={m.value || 'any'} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        value={day}
        onChange={(e) => onDayChange(e.target.value)}
        className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none cursor-pointer min-w-[4rem]"
        aria-label="Day"
      >
        {DAYS.map((d) => (
          <option key={d.value || 'any'} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Returns true if patient DOB (YYYY-MM-DD string or null) matches the selected year/month/day (each optional). */
export function matchDob(
  dateOfBirth: string | null | undefined,
  year: string,
  month: string,
  day: string
): boolean {
  if (!dateOfBirth) return false
  const [y, m, d] = dateOfBirth.split('-')
  if (!y) return false
  if (year && y !== year) return false
  if (month && m !== month) return false
  if (day && d !== day) return false
  return true
}
