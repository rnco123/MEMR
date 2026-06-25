'use client'

import { useEffect, useState } from 'react'
import { parsePatientSearchLocally } from '@/lib/nurse/patient-search-local'
import type { ParsedPatientSearch } from '@/lib/nurse/patient-search-types'

type Options = {
  includeProvider?: boolean
  debounceMs?: number
  enabled?: boolean
}

export function useAiPatientSearchParse(query: string, options: Options = {}) {
  const { includeProvider = false, debounceMs = 300, enabled = true } = options
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const [parsed, setParsed] = useState<ParsedPatientSearch | null>(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs)
    return () => clearTimeout(timer)
  }, [query, debounceMs])

  useEffect(() => {
    if (!enabled) return

    const trimmed = debouncedQuery.trim()
    if (!trimmed) {
      setParsed(null)
      setParsing(false)
      setError(null)
      return
    }

    let cancelled = false
    setParsing(true)
    setError(null)

    void (async () => {
      try {
        const res = await fetch('/api/clinical/patient-search/parse', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed, includeProvider }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Search parse failed')
        if (cancelled) return
        setParsed((json.data as ParsedPatientSearch | null) ?? parsePatientSearchLocally(trimmed, { includeProvider }))
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Search parse failed')
        setParsed(parsePatientSearchLocally(trimmed, { includeProvider }))
      } finally {
        if (!cancelled) setParsing(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, includeProvider, enabled])

  const isPending = query !== debouncedQuery || parsing

  return {
    parsed,
    parsing,
    isPending,
    error,
    debouncedQuery,
  }
}
