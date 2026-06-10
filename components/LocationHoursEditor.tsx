'use client'

import { useMemo } from 'react'
import { useT } from '@/lib/i18n'
import {
  WEEKDAY_KEYS,
  type WeekdayKey,
  type WeeklyHours,
  copyDayToAll,
  copyDayToWeekdays,
  applyStandardWeekPreset,
  formatOpeningHoursDisplay,
  parseOpeningHours,
  serializeOpeningHours,
} from '@/lib/locations/hours'

type Props = {
  value: string
  onChange: (value: string) => void
}

const DAY_I18N_KEYS: Record<WeekdayKey, string> = {
  mon: 'locations.hours_day_mon',
  tue: 'locations.hours_day_tue',
  wed: 'locations.hours_day_wed',
  thu: 'locations.hours_day_thu',
  fri: 'locations.hours_day_fri',
  sat: 'locations.hours_day_sat',
  sun: 'locations.hours_day_sun',
}

export function LocationHoursEditor({ value, onChange }: Props) {
  const { t } = useT()
  const schedule = useMemo(() => parseOpeningHours(value), [value])

  const dayLabels = useMemo(
    () =>
      WEEKDAY_KEYS.reduce(
        (acc, key) => {
          acc[key] = t(DAY_I18N_KEYS[key])
          return acc
        },
        {} as Record<WeekdayKey, string>
      ),
    [t]
  )

  const summary = useMemo(
    () =>
      formatOpeningHoursDisplay(value, {
        days: dayLabels,
        closed: t('locations.hours_closed'),
      }),
    [value, dayLabels, t]
  )

  const updateSchedule = (next: WeeklyHours) => {
    onChange(serializeOpeningHours(next) ?? '')
  }

  const updateDay = (key: WeekdayKey, patch: Partial<WeeklyHours[WeekdayKey]>) => {
    const next = { ...schedule, [key]: { ...schedule[key], ...patch } }
    updateSchedule(next)
  }

  return (
    <div className="mt-1 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => updateSchedule(copyDayToWeekdays(schedule))}
          className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
        >
          {t('locations.hours_apply_weekdays')}
        </button>
        <button
          type="button"
          onClick={() => updateSchedule(copyDayToAll(schedule))}
          className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
        >
          {t('locations.hours_apply_all')}
        </button>
        <button
          type="button"
          onClick={() => updateSchedule(applyStandardWeekPreset())}
          className="px-2.5 py-1 text-xs font-medium rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
        >
          {t('locations.hours_preset_standard')}
        </button>
      </div>

      <div className="space-y-2">
        {WEEKDAY_KEYS.map((key) => {
          const day = schedule[key]
          return (
            <div
              key={key}
              className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2 border border-slate-100 sm:grid sm:grid-cols-[72px_100px_1fr_1fr] sm:items-center"
            >
              <span className="text-sm font-medium text-slate-800">{dayLabels[key]}</span>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={day.closed}
                  onChange={(e) => updateDay(key, { closed: e.target.checked })}
                  className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                {t('locations.hours_closed')}
              </label>
              <div className="flex items-center gap-2 sm:contents">
                <input
                  type="time"
                  value={day.start}
                  disabled={day.closed}
                  onChange={(e) => updateDay(key, { start: e.target.value })}
                  aria-label={`${dayLabels[key]} ${t('locations.hours_open')}`}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                />
                <input
                  type="time"
                  value={day.end}
                  disabled={day.closed}
                  onChange={(e) => updateDay(key, { end: e.target.value })}
                  aria-label={`${dayLabels[key]} ${t('locations.hours_close')}`}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
            </div>
          )
        })}
      </div>

      {summary ? (
        <p className="text-xs text-slate-500">
          <span className="font-medium text-slate-600">{t('locations.hours_preview')}: </span>
          {summary}
        </p>
      ) : null}
    </div>
  )
}
