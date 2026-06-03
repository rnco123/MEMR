'use client'

import { useMemo, useState } from 'react'
import { useT } from '@/lib/i18n'

export type LocationAssignmentOption = {
  id: number
  title: string
  location_code?: string | null
  address?: string | null
}

type LocationAssignmentChecklistProps = {
  locations: LocationAssignmentOption[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  listClassName?: string
}

export function LocationAssignmentChecklist({
  locations,
  selectedIds,
  onChange,
  listClassName = 'max-h-64',
}: LocationAssignmentChecklistProps) {
  const { t } = useT()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return locations
    return locations.filter(
      (loc) =>
        loc.title.toLowerCase().includes(q) ||
        (loc.location_code?.toLowerCase().includes(q) ?? false) ||
        (loc.address?.toLowerCase().includes(q) ?? false)
    )
  }, [locations, query])

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((loc) => selectedIds.includes(loc.id))

  const toggleOne = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  }

  const selectAllVisible = () => {
    const next = new Set(selectedIds)
    for (const loc of filtered) next.add(loc.id)
    onChange([...next])
  }

  const clearAll = () => onChange([])

  const selectEveryLocation = () => onChange(locations.map((l) => l.id))

  if (locations.length === 0) {
    return <p className="text-sm text-slate-500">{t('admin.users.no_locations_available')}</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin.users.search_locations')}
          className="flex-1 min-w-[140px] h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <button
          type="button"
          onClick={allVisibleSelected ? clearAll : selectAllVisible}
          className="h-9 px-3 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {allVisibleSelected ? t('admin.users.clear_locations') : t('admin.users.select_visible_locations')}
        </button>
        <button
          type="button"
          onClick={selectEveryLocation}
          className="h-9 px-3 border border-purple-200 rounded-lg text-xs font-semibold text-purple-700 hover:bg-purple-50"
        >
          {t('admin.users.select_all_locations')}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {t('admin.users.locations_selected_count', {
          selected: selectedIds.length,
          total: locations.length,
        })}
      </p>
      <div
        className={`space-y-1.5 overflow-y-auto border border-slate-100 rounded-xl p-3 bg-slate-50/50 ${listClassName}`}
      >
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">{t('admin.users.no_locations_match')}</p>
        ) : (
          filtered.map((loc) => (
            <label key={loc.id} className="flex items-start gap-2 cursor-pointer group py-0.5">
              <input
                type="checkbox"
                checked={selectedIds.includes(loc.id)}
                onChange={() => toggleOne(loc.id)}
                className="w-4 h-4 mt-1 accent-purple-600 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-slate-700 group-hover:text-slate-900 leading-snug">
                  {loc.title}
                </span>
                {loc.address?.trim() ? (
                  <span className="block text-xs text-slate-400 truncate leading-snug mt-0.5">
                    {loc.address.trim()}
                  </span>
                ) : null}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}
