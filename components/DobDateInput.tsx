'use client'

import { useRef } from 'react'
import { todayLocalIsoDate, toDateInputValue } from '@/lib/datetime/date-input'

type Props = {
  value: string | null | undefined
  onChange: (value: string | null) => void
  className?: string
  id?: string
  disabled?: boolean
}

export function DobDateInput({ value, onChange, className, id, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputValue = toDateInputValue(value)

  const openCalendar = () => {
    const el = inputRef.current
    if (!el || disabled) return
    if (typeof el.showPicker === 'function') {
      el.showPicker()
    } else {
      el.focus()
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="date"
        value={inputValue}
        max={todayLocalIsoDate()}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className={className ? `${className} pr-10` : 'w-full pr-10'}
      />
      <button
        type="button"
        onClick={openCalendar}
        disabled={disabled}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
        aria-label="Open calendar"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>
    </div>
  )
}
