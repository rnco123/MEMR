'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

export type SelectOption = { value: string; label: string }

/**
 * Dropdown with a styled, searchable drawer.
 *
 * A native <select> renders its list with the OS, so it cannot be themed or made
 * searchable. This owns the list instead, which matters for the service picker: a
 * clinic can offer twenty-five treatments and scrolling an unfiltered OS menu to find
 * one is slow.
 */
export function SelectDrawer({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = 'Search…',
  emptyLabel = 'No matches',
  disabled = false,
  id,
  searchThreshold = 8,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder: string
  searchPlaceholder?: string
  emptyLabel?: string
  disabled?: boolean
  id?: string
  /** Show the filter box once the list is at least this long. */
  searchThreshold?: number
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const selected = options.find((o) => String(o.value) === String(value)) ?? null
  const showSearch = options.length >= searchThreshold

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  const close = () => {
    setIsOpen(false)
    setQuery('')
    setActiveIndex(-1)
  }

  const pick = (option: SelectOption) => {
    onChange(option.value)
    close()
  }

  useEffect(() => {
    if (!isOpen) return
    if (showSearch) searchRef.current?.focus()
    setActiveIndex(visible.findIndex((o) => String(o.value) === String(value)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return
    listRef.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView({
      block: 'nearest',
    })
  }, [activeIndex, isOpen])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      setIsOpen(true)
      return
    }
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, visible.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const option = visible[activeIndex]
      if (option) pick(option)
    }
  }

  return (
    <div className="relative w-full" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
          isOpen ? 'border-[#2E6EF3] ring-2 ring-[#2E6EF3]/20' : 'border-slate-300 hover:border-slate-400'
        } ${selected ? 'text-slate-900' : 'text-slate-400'}`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen ? (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            {showSearch ? (
              <div className="border-b border-slate-100 p-2">
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setActiveIndex(0)
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#2E6EF3] focus:bg-white focus:outline-none"
                />
              </div>
            ) : null}

            <div className="max-h-64 overflow-y-auto py-1" role="listbox" ref={listRef}>
              {visible.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-slate-400">{emptyLabel}</p>
              ) : (
                visible.map((option, index) => {
                  const isSelected = String(option.value) === String(value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => pick(option)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        index === activeIndex ? 'bg-slate-50' : ''
                      } ${isSelected ? 'font-medium text-[#2E6EF3]' : 'text-slate-700'}`}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected ? (
                        <svg
                          className="h-4 w-4 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
