'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UserLocation } from '@/lib/hooks/use-user-locations'
import { useT } from '@/lib/i18n'

type LocationCheckboxDropdownProps = {
  locations: UserLocation[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  unrestricted?: boolean
  className?: string
}

function normalizeSelection(ids: number[], total: number): number[] {
  if (ids.length === 0 || ids.length === total) return []
  return ids
}

export function LocationCheckboxDropdown({
  locations,
  selectedIds,
  onChange,
  unrestricted = false,
  className = '',
}: LocationCheckboxDropdownProps) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const singleLocation = !unrestricted && locations.length === 1 ? locations[0] : undefined
  const isAllSelected = selectedIds.length === 0

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

  const summary = useMemo(() => {
    if (isAllSelected) return t('location.all_locations')
    if (selectedIds.length === 1) {
      const loc = locations.find((l) => l.id === selectedIds[0])
      return loc?.title ?? t('location.selected_count', { count: 1 })
    }
    return t('location.selected_count', { count: selectedIds.length })
  }, [isAllSelected, locations, selectedIds, t])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [close, open])

  const selectAll = () => onChange([])

  const toggleOne = (id: number) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : isAllSelected
        ? [id]
        : [...selectedIds, id]
    onChange(normalizeSelection(next, locations.length))
  }

  if (singleLocation) {
    return (
      <div
        className={`inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 ${className}`}
      >
        <svg className="h-3.5 w-3.5 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  if (!unrestricted && locations.length === 0) return null

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex h-8 min-w-[11rem] max-w-[16rem] items-center gap-2 rounded-lg border bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 ${
          open ? 'border-[#2E6EF3] ring-2 ring-[#2E6EF3]/20' : 'border-slate-200'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('location.filter_label')}
      >
        <svg className="h-3.5 w-3.5 shrink-0 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="truncate">{summary}</span>
        <svg
          className={`ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {locations.length > 5 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('admin.users.search_locations')}
              className="mb-2 h-8 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/30"
            />
          )}

          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={selectAll}
              className="h-3.5 w-3.5 rounded border-slate-300 text-[#2E6EF3] focus:ring-[#2E6EF3]"
            />
            <span className="text-xs font-medium text-slate-700">{t('location.all_locations')}</span>
          </label>

          <div className="my-1 border-t border-slate-100" />

          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-xs text-slate-500">{t('admin.users.no_locations_match')}</p>
            ) : (
              filtered.map((location) => (
                <label
                  key={location.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={!isAllSelected && selectedIds.includes(location.id)}
                    onChange={() => toggleOne(location.id)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-[#2E6EF3] focus:ring-[#2E6EF3]"
                  />
                  <span className="min-w-0 text-xs leading-snug text-slate-700">{location.title}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
