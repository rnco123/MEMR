'use client'

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'

type Props = {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  minQueryLength?: number
}

export function AddressLookupInput({
  value,
  onChange,
  label,
  placeholder,
  className = 'mt-1 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900',
  disabled = false,
  minQueryLength = 4,
}: Props) {
  const { t } = useT()
  const [lookupEnabled, setLookupEnabled] = useState<boolean | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const lastSelectedRef = useRef('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeqRef = useRef(0)

  useEffect(() => {
    fetch('/api/address/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setLookupEnabled(Boolean(data?.enabled)))
      .catch(() => setLookupEnabled(false))
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const query = value.trim()
    if (lastSelectedRef.current === query) {
      setLoadingSuggestions(false)
      return
    }

    if (!query || query.length < minQueryLength || lookupEnabled !== true || disabled) {
      setSuggestions([])
      setLoadingSuggestions(false)
      return
    }

    setLoadingSuggestions(true)
    const seq = ++requestSeqRef.current
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address/suggestions?search=${encodeURIComponent(query)}`, {
          credentials: 'include',
        })
        if (seq !== requestSeqRef.current) return
        if (!res.ok) {
          setSuggestions([])
          return
        }
        const data = await res.json()
        if (seq !== requestSeqRef.current) return
        const list = Array.isArray(data.suggestions)
          ? data.suggestions.map((s: { fullAddress?: string }) => s.fullAddress).filter(Boolean)
          : []
        setSuggestions(list as string[])
      } catch {
        if (seq === requestSeqRef.current) setSuggestions([])
      } finally {
        if (seq === requestSeqRef.current) setLoadingSuggestions(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, lookupEnabled, disabled, minQueryLength])

  const applySuggestion = (suggestion: string) => {
    lastSelectedRef.current = suggestion
    requestSeqRef.current++
    onChange(suggestion)
    setSuggestions([])
    setLoadingSuggestions(false)
    setTimeout(() => {
      lastSelectedRef.current = ''
    }, 500)
  }

  const showSuggestions = suggestions.length > 0 && !disabled

  return (
    <div className="relative">
      {label ? <label className="text-sm text-slate-700">{label}</label> : null}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="street-address"
      />
      {loadingSuggestions ? (
        <p className="text-xs text-slate-400 mt-1">{t('address.lookup_searching')}</p>
      ) : null}
      {lookupEnabled === false && value.trim().length >= minQueryLength ? (
        <p className="text-xs text-slate-400 mt-1">{t('address.lookup_unconfigured')}</p>
      ) : null}
      {showSuggestions ? (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion}-${index}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applySuggestion(suggestion)}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
