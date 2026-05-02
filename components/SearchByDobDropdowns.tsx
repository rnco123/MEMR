'use client'

import { useT } from '@/lib/i18n'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1919 }, (_, i) => CURRENT_YEAR - i) // 1920..current

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
  const { t, language } = useT()
  const monthLocale = language === 'es' ? 'es-ES' : 'en-US'
  const months = [
    { value: '', label: t('flow.month') },
    ...Array.from({ length: 12 }, (_, i) => ({
      value: String(i + 1).padStart(2, '0'),
      label: new Date(2000, i, 1).toLocaleString(monthLocale, { month: 'short' }),
    })),
  ]
  const days = [
    { value: '', label: t('flow.day') },
    ...Array.from({ length: 31 }, (_, i) => ({
      value: String(i + 1).padStart(2, '0'),
      label: String(i + 1),
    })),
  ]
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-slate-500 text-xs whitespace-nowrap font-semibold uppercase tracking-wide">
        {t('flow.search_dob')}
      </span>
      <select
        value={year}
        onChange={(e) => onYearChange(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] cursor-pointer min-w-[4.5rem]"
        aria-label={t('flow.year')}
      >
        <option value="">{t('flow.year')}</option>
        {YEARS.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => onMonthChange(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] cursor-pointer min-w-[5rem]"
        aria-label={t('flow.month')}
      >
        {months.map((m) => (
          <option key={m.value || 'any'} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        value={day}
        onChange={(e) => onDayChange(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] cursor-pointer min-w-[4rem]"
        aria-label={t('flow.day')}
      >
        {days.map((d) => (
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
