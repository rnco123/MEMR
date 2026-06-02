'use client'

import type { UserLocation } from '@/lib/hooks/use-user-locations'
import { useT } from '@/lib/i18n'

type AssignedLocationsPanelProps = {
  locations: UserLocation[]
  loading?: boolean
}

export function AssignedLocationsPanel({ locations, loading }: AssignedLocationsPanelProps) {
  const { t } = useT()

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="h-5 w-40 bg-slate-100 rounded animate-pulse mb-3" />
        <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
      </div>
    )
  }

  if (locations.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
        <p className="text-sm text-amber-900 font-medium">{t('location.no_assignments_title')}</p>
        <p className="text-sm text-amber-800 mt-1">{t('location.no_assignments_body')}</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
      <h3 className="text-base font-semibold text-slate-900 mb-3">{t('location.your_locations')}</h3>
      <ul className="flex flex-wrap gap-2">
        {locations.map((loc) => (
          <li
            key={loc.id}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#2E6EF3]/8 border border-[#2E6EF3]/20 rounded-lg text-sm text-slate-800"
          >
            <svg className="w-4 h-4 text-[#2E6EF3] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-medium">{loc.title}</span>
            {loc.location_code ? (
              <span className="text-xs text-slate-500">({loc.location_code})</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
