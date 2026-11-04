'use client'

import { useT } from '@/lib/i18n'

// Own sizing: FLOWBOARD_SELECT_CLASS has `w-full`, which made the From box fill the row
// and pushed the To box out of view (the field clips overflow).
const DATE_INPUT_CLASS =
  'h-9 min-w-[8.5rem] flex-1 px-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] cursor-pointer'

export type AppointmentDateRangeFilterProps = {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  className?: string
  fromLabel?: string
  toLabel?: string
}

export function AppointmentDateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  className = '',
  fromLabel,
  toLabel,
}: AppointmentDateRangeFilterProps) {
  const { t } = useT()
  const fromAria = fromLabel ?? t('appointments.date_from')
  const toAria = toLabel ?? t('appointments.date_to')

  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${className}`.trim()}>
      <input
        type="date"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        className={DATE_INPUT_CLASS}
        aria-label={fromAria}
      />
      <span className="shrink-0 text-xs text-slate-400" aria-hidden>
        —
      </span>
      <input
        type="date"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        className={DATE_INPUT_CLASS}
        aria-label={toAria}
      />
    </div>
  )
}
