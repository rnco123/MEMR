'use client'

import type { UserLocation } from '@/lib/hooks/use-user-locations'
import { useT } from '@/lib/i18n'

type LocationFilterSelectProps = {
  locations: UserLocation[]
  value: number | 'all'
  onChange: (value: number | 'all') => void
  unrestricted?: boolean
  className?: string
}

export function LocationFilterSelect({
  locations,
  value,
  onChange,
  unrestricted = false,
  className = '',
}: LocationFilterSelectProps) {
  const { t } = useT()

  const singleLocation = locations.length === 1 ? locations[0] : undefined
  if (!unrestricted && singleLocation) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 ${className}`}
      >
        <svg className="w-4 h-4 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="font-medium">{singleLocation.title}</span>
      </div>
    )
  }

  if (!unrestricted && locations.length === 0) {
    return null
  }

  return (
    <select
      value={value === 'all' ? 'all' : String(value)}
      onChange={(e) => {
        const v = e.target.value
        onChange(v === 'all' ? 'all' : Number(v))
      }}
      className={`px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/30 ${className}`}
      aria-label={t('location.filter_label')}
    >
      <option value="all">{t('location.all_locations')}</option>
      {locations.map((loc) => (
        <option key={loc.id} value={loc.id}>
          {loc.title}
        </option>
      ))}
    </select>
  )
}
