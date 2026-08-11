'use client'

import { useEffect, useMemo, useState } from 'react'
import { parsePatientSearchLocally } from '@/lib/nurse/patient-search-local'
import type { ParsedPatientSearch } from '@/lib/nurse/patient-search-types'

type Options = {
  includeProvider?: boolean
  debounceMs?: number
  enabled?: boolean
}

export function usePatientSearchParse(query: string, options: Options = {}) {
  const { includeProvider = false, debounceMs = 300, enabled = true } = options
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs)
    return () => clearTimeout(timer)
  }, [query, debounceMs])

  const parsed = useMemo<ParsedPatientSearch | null>(() => {
    if (!enabled) return null
    const trimmed = debouncedQuery.trim()
    if (!trimmed) return null
    return parsePatientSearchLocally(trimmed, { includeProvider })
  }, [debouncedQuery, includeProvider, enabled])

  const isPending = query !== debouncedQuery

  return {
    parsed,
    parsing: false,
    isPending,
    error: null as string | null,
    debouncedQuery,
  }
}
