'use client'

import { useMemo, useState } from 'react'
import type { UserLocation } from '@/lib/hooks/use-user-locations'
import { useT } from '@/lib/i18n'

type AssignedLocationsPanelProps = {
  locations: UserLocation[]
  loading?: boolean
}

const COLLAPSE_THRESHOLD = 4
const PREVIEW_COUNT = 3

function LocationPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function LocationRow({ loc }: { loc: UserLocation }) {
  return (
    <li className="flex items-center gap-2.5 py-2.5 border-b border-slate-100 last:border-0 min-w-0">
      <LocationPinIcon className="w-4 h-4 text-[#2E6EF3] shrink-0" />
      <span className="text-sm font-medium text-slate-800 truncate">{loc.title}</span>
      {loc.location_code ? (
        <span className="text-xs text-slate-400 shrink-0 tabular-nums">{loc.location_code}</span>
      ) : null}
    </li>
  )
}

export function AssignedLocationsPanel({ locations, loading }: AssignedLocationsPanelProps) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)

  const isCollapsible = locations.length > COLLAPSE_THRESHOLD

  const visibleLocations = useMemo(() => {
    if (!isCollapsible || expanded) return locations
    return locations.slice(0, PREVIEW_COUNT)
  }, [locations, isCollapsible, expanded])

  const hiddenCount = isCollapsible && !expanded ? locations.length - PREVIEW_COUNT : 0

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="h-5 w-40 bg-slate-100 rounded animate-pulse mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
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
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-base font-semibold text-slate-900">{t('location.your_locations')}</h3>
        <span className="inline-flex shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 tabular-nums">
          {t('location.selected_count', { count: locations.length })}
        </span>
      </div>

      <ul
        className={
          expanded && isCollapsible
            ? 'max-h-52 overflow-y-auto overscroll-contain rounded-lg border border-slate-100 bg-slate-50/50 px-3'
            : 'rounded-lg border border-slate-100 bg-slate-50/50 px-3'
        }
      >
        {visibleLocations.map((loc) => (
          <LocationRow key={loc.id} loc={loc} />
        ))}
      </ul>

      {isCollapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-sm font-semibold text-[#2E6EF3] hover:text-[#2459c9] transition-colors"
        >
          {expanded
            ? t('location.show_less')
            : hiddenCount > 0
              ? t('location.show_all_with_more', { count: hiddenCount })
              : t('location.show_all')}
        </button>
      ) : null}
    </div>
  )
}
