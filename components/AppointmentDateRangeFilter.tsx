'use client'

import { FLOWBOARD_SELECT_CLASS } from '@/components/FlowboardFilterToolbar'
import { useT } from '@/lib/i18n'

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
        className={`${FLOWBOARD_SELECT_CLASS} w-[min(100%,9.5rem)] shrink-0`}
        aria-label={fromAria}
      />
      <span className="shrink-0 text-xs text-slate-400" aria-hidden>
        —
      </span>
      <input
        type="date"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        className={`${FLOWBOARD_SELECT_CLASS} w-[min(100%,9.5rem)] shrink-0`}
        aria-label={toAria}
      />
    </div>
  )
}
