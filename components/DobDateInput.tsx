'use client'

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'
import { toDateInputValue } from '@/lib/datetime/date-input'

type Props = {
  value: string | null | undefined
  onChange: (value: string | null) => void
  className?: string
  id?: string
  disabled?: boolean
}

type Segments = { month: string; day: string; year: string }

/**
 * Masked MM/DD/YYYY date entry — no calendar picker. Each segment is checked
 * in the position it occupies: a digit that cannot begin a month/day is
 * padded and advanced, separators are inserted as segments complete (but not
 * re-inserted while deleting), and a rejected entry stays in the field so it
 * can be corrected. Emits an ISO yyyy-mm-dd via onChange only while the typed
 * date is complete and valid; otherwise emits null.
 */
export function DobDateInput({ value, onChange, className, id, disabled }: Props) {
  const { t } = useT()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const lastEmittedIso = useRef<string | null>(null)

  // Sync from the outside (prefill, reset) without fighting the user's typing.
  useEffect(() => {
    const iso = toDateInputValue(value) || ''
    if (iso === (lastEmittedIso.current ?? '')) return
    lastEmittedIso.current = iso || null
    if (!iso) {
      setText('')
      setError(null)
      return
    }
    const [y, m, d] = iso.split('-')
    if (y && m && d) {
      setText(`${m}/${d}/${y}`)
      setError(null)
    }
  }, [value])

  const emit = (iso: string | null) => {
    if (iso === lastEmittedIso.current) return
    lastEmittedIso.current = iso
    onChange(iso)
  }

  const daysInMonth = (month: number, year: number | null): number => {
    if (month === 2) {
      if (year == null) return 29 // leap allowed until the year is known
      const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
      return leap ? 29 : 28
    }
    return [4, 6, 9, 11].includes(month) ? 30 : 31
  }

  /** Parse typed text into padded segments; "/" terminates a short segment. */
  const parse = (raw: string): Segments => {
    let month = ''
    let day = ''
    let year = ''
    let stage: 0 | 1 | 2 = 0
    for (const ch of raw) {
      if (/\d/.test(ch)) {
        if (stage === 0) {
          if (month.length === 0 && ch > '1') {
            month = `0${ch}`
            stage = 1
          } else {
            month += ch
            if (month.length === 2) stage = 1
          }
        } else if (stage === 1) {
          if (day.length === 0 && ch > '3') {
            day = `0${ch}`
            stage = 2
          } else {
            day += ch
            if (day.length === 2) stage = 2
          }
        } else if (year.length < 4) {
          year += ch
        }
      } else if (ch === '/') {
        if (stage === 0 && month.length >= 1) {
          month = month.padStart(2, '0')
          stage = 1
        } else if (stage === 1 && day.length >= 1) {
          day = day.padStart(2, '0')
          stage = 2
        }
      }
    }
    return { month, day, year }
  }

  const validate = ({ month, day, year }: Segments): string | null => {
    const m = month.length === 2 ? Number(month) : null
    const d = day.length === 2 ? Number(day) : null
    const y = year.length === 4 ? Number(year) : null

    if (m != null && (m < 1 || m > 12)) return t('dob_input.err_month')
    if (m != null && d != null && (d < 1 || d > daysInMonth(m, y))) {
      return t('dob_input.err_day', { day: String(d) })
    }
    if (y != null) {
      if (y <= 1900) return t('dob_input.err_year_min')
      const now = new Date()
      if (y > now.getFullYear()) return t('dob_input.err_year_future')
      if (m != null && d != null) {
        const typed = new Date(y, m - 1, d)
        if (typed.getTime() > now.getTime()) return t('dob_input.err_year_future')
      }
    }
    return null
  }

  const format = ({ month, day, year }: Segments): string => {
    let out = month
    if (month.length === 2) out += '/'
    out += day
    if (month.length === 2 && day.length === 2) out += '/'
    out += year
    return out
  }

  const applyInput = (raw: string, deleting: boolean) => {
    const segments = parse(raw)
    // While deleting, keep the text verbatim so the separator is not re-inserted.
    setText(deleting ? raw : format(segments))
    const err = validate(segments)
    setError(err)
    const complete =
      segments.month.length === 2 && segments.day.length === 2 && segments.year.length === 4
    emit(complete && !err ? `${segments.year}-${segments.month}-${segments.day}` : null)
  }

  const handleBlur = () => {
    // Tidy a complete short-hand entry: 1/5/1990 -> 01/05/1990.
    const segments = parse(text)
    if (segments.month && segments.day && segments.year.length === 4) {
      const padded: Segments = {
        month: segments.month.padStart(2, '0'),
        day: segments.day.padStart(2, '0'),
        year: segments.year,
      }
      setText(format(padded))
      const err = validate(padded)
      setError(err)
      emit(!err ? `${padded.year}-${padded.month}-${padded.day}` : null)
    }
  }

  return (
    <div>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        placeholder={t('dob_input.placeholder')}
        value={text}
        disabled={disabled}
        maxLength={10}
        onChange={(e) => applyInput(e.target.value, e.target.value.length < text.length)}
        onBlur={handleBlur}
        aria-invalid={error ? true : undefined}
        className={`${className ?? 'w-full'} ${error ? 'border-red-400 focus:ring-red-300' : ''}`}
      />
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
