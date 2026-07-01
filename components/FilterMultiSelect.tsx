'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'

export type FilterMultiSelectOption = {
  id: number
  label: string
}

type Props = {
  label: string
  options: FilterMultiSelectOption[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  allLabel: string
  searchPlaceholder?: string
  className?: string
}

export function FilterMultiSelect({
  label,
  options,
  selectedIds,
  onChange,
  allLabel,
  searchPlaceholder,
  className = '',
}: Props) {
  const { t } = useT()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((opt) => opt.label.toLowerCase().includes(q))
  }, [options, query])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const allOptionIds = useMemo(() => options.map((opt) => opt.id), [options])

  // "All" is checked only when nothing specific is selected (= no filter = show all)
  const allRowChecked = selectedIds.length === 0

  const triggerLabel = useMemo(() => {
    if (selectedIds.length === 0) return allLabel
    const labels = options
      .filter((opt) => selectedSet.has(opt.id))
      .map((opt) => opt.label)
    if (labels.length === 0) return allLabel
    if (labels.length === 1) return labels[0]!
    if (labels.length === 2) return `${labels[0]!}, ${labels[1]!}`
    return t('admin.prescriptions.filter_selected_count', { count: labels.length })
  }, [allLabel, options, selectedIds.length, selectedSet, t])

  const toggleId = (id: number) => {
    if (selectedIds.length === 0) {
      // Was "all" — selecting one item means "only this one", so all others become unchecked
      onChange([id])
      return
    }
    if (selectedSet.has(id)) {
      const next = selectedIds.filter((value) => value !== id)
      // If last item unchecked, go back to "all" (empty = no filter)
      onChange(next)
    } else {
      onChange([...selectedIds, id])
    }
  }

  const toggleAll = () => {
    // Clicking All always resets to "no filter" (empty selection = all)
    onChange([])
  }

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`}>
      <span className={`text-[10px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap block mb-1`}>
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="h-8 min-w-[9rem] max-w-[12rem] px-2 flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate text-left">{triggerLabel}</span>
        <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder ?? t('admin.prescriptions.filter_search')}
              className="w-full h-8 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              autoFocus
            />
          </div>
          <div className="border-b border-slate-200">
            <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-violet-800 hover:bg-violet-50 cursor-pointer">
              <input
                type="checkbox"
                checked={allRowChecked}
                onChange={toggleAll}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span className="truncate">{allLabel}</span>
            </label>
          </div>
          <ul id={listId} role="listbox" className="max-h-52 overflow-auto py-1">
            {options.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-500">{t('admin.prescriptions.filter_no_options')}</li>
            ) : filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-500">{t('admin.prescriptions.filter_no_matches')}</li>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selectedSet.has(opt.id)
                return (
                  <li key={opt.id} role="option" aria-selected={checked}>
                    <label className="flex items-center gap-2 px-3 py-2 text-xs text-slate-800 hover:bg-violet-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleId(opt.id)}
                        className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      />
                      <span className="truncate">{opt.label}</span>
                    </label>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
