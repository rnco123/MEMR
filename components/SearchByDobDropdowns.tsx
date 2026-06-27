'use client'

import { useT } from '@/lib/i18n'
import { matchDobParts } from '@/lib/nurse/patient-dob-match'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1919 }, (_, i) => CURRENT_YEAR - i)

const SELECT_CLASS =
  'w-full min-w-0 h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] cursor-pointer'

const COMPACT_SELECT_CLASS =
  'w-full min-w-0 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] cursor-pointer'

export interface SearchByDobDropdownsProps {
  year: string
  month: string
  day: string
  onYearChange: (value: string) => void
  onMonthChange: (value: string) => void
  onDayChange: (value: string) => void
  className?: string
  layout?: 'stacked' | 'inline' | 'compact'
}

export function SearchByDobDropdowns({
  year,
  month,
  day,
  onYearChange,
  onMonthChange,
  onDayChange,
  className = '',
  layout = 'stacked',
}: SearchByDobDropdownsProps) {
  const { t, language } = useT()
  const selectClass = layout === 'compact' ? COMPACT_SELECT_CLASS : SELECT_CLASS
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

  const yearSelect = (
    <select value={year} onChange={(e) => onYearChange(e.target.value)} className={selectClass} aria-label={t('flow.year')}>
      <option value="">{t('flow.year')}</option>
      {YEARS.map((y) => (
        <option key={y} value={String(y)}>{y}</option>
      ))}
    </select>
  )

  const monthSelect = (
    <select value={month} onChange={(e) => onMonthChange(e.target.value)} className={selectClass} aria-label={t('flow.month')}>
      {months.map((m) => (
        <option key={m.value || 'any'} value={m.value}>{m.label}</option>
      ))}
    </select>
  )

  const daySelect = (
    <select value={day} onChange={(e) => onDayChange(e.target.value)} className={selectClass} aria-label={t('flow.day')}>
      {days.map((d) => (
        <option key={d.value || 'any'} value={d.value}>{d.label}</option>
      ))}
    </select>
  )

  if (layout === 'compact') {
    return (
      <div className={`flex items-center gap-1.5 min-w-0 ${className}`}>
        <div className="w-[4.75rem] min-w-0 shrink-0">{yearSelect}</div>
        <div className="w-[4.25rem] min-w-0 shrink-0">{monthSelect}</div>
        <div className="w-[3.75rem] min-w-0 shrink-0">{daySelect}</div>
      </div>
    )
  }

  if (layout === 'inline') {
    return (
      <div className={`flex flex-wrap items-center gap-2 max-w-full min-w-0 ${className}`}>
        <span className="text-slate-500 text-xs whitespace-nowrap font-semibold uppercase tracking-wide">{t('flow.search_dob')}</span>
        <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
          <div className="w-[5.5rem] min-w-0 shrink-0">{yearSelect}</div>
          <div className="w-[5.5rem] min-w-0 shrink-0">{monthSelect}</div>
          <div className="w-[4.5rem] min-w-0 shrink-0">{daySelect}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-2 min-w-0 max-w-full ${className}`}>
      <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wide">{t('flow.search_dob')}</span>
      <div className="grid grid-cols-3 gap-2 w-full min-w-0">
        {yearSelect}
        {monthSelect}
        {daySelect}
      </div>
    </div>
  )
}

export function matchDob(
  dateOfBirth: string | null | undefined,
  year: string,
  month: string,
  day: string
): boolean {
  return matchDobParts(dateOfBirth, year, month, day)
}
