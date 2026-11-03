'use client'

import { useEffect, useRef, useState } from 'react'
import type { AddressSuggestion } from '@/lib/address/suggestions'

export type { AddressSuggestion }

type Options = {
  /** Current text of the street/address field. */
  query: string
  minQueryLength?: number
  disabled?: boolean
}

type Result = {
  suggestions: AddressSuggestion[]
  loading: boolean
  /** null while the server capability check is still in flight. */
  lookupEnabled: boolean | null
  /** Call after applying a suggestion so the dropdown does not immediately reopen. */
  suppressUntilNextEdit: (appliedValue: string) => void
  /** Call when the user types, to re-enable lookups. */
  resumeLookup: () => void
  suppressed: boolean
}

/**
 * Debounced Mapbox address autocomplete against `/api/address/suggestions`.
 * Shared by every address entry point (patients, pharmacies, locations).
 */
export function useAddressSuggestions({
  query,
  minQueryLength = 4,
  disabled = false,
}: Options): Result {
  const [lookupEnabled, setLookupEnabled] = useState<boolean | null>(null)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [suppressed, setSuppressed] = useState(false)
  const lastSelectedRef = useRef('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeqRef = useRef(0)

  useEffect(() => {
    let active = true
    fetch('/api/address/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (active) setLookupEnabled(Boolean(data?.enabled))
      })
      .catch(() => {
        if (active) setLookupEnabled(false)
      })
    return () => {
      active = false
    }
  }, [])

  const trimmed = query.trim()

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Skip lookup right after a suggestion was applied, until the user types again.
    if (suppressed || lastSelectedRef.current === trimmed) {
      setSuggestions([])
      setLoading(false)
      return
    }

    if (!trimmed || trimmed.length < minQueryLength || lookupEnabled !== true || disabled) {
      setSuggestions([])
      setLoading(false)
      return
    }

    setLoading(true)
    const seq = ++requestSeqRef.current
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/address/suggestions?search=${encodeURIComponent(trimmed)}`,
          { credentials: 'include' }
        )
        if (seq !== requestSeqRef.current) return
        if (!res.ok) {
          setSuggestions([])
          return
        }
        const data = await res.json()
        if (seq !== requestSeqRef.current) return
        setSuggestions(
          Array.isArray(data?.suggestions)
            ? (data.suggestions as AddressSuggestion[]).filter((s) => s?.fullAddress)
            : []
        )
      } catch {
        if (seq === requestSeqRef.current) setSuggestions([])
      } finally {
        if (seq === requestSeqRef.current) setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmed, lookupEnabled, disabled, minQueryLength, suppressed])

  const suppressUntilNextEdit = (appliedValue: string) => {
    requestSeqRef.current++
    lastSelectedRef.current = appliedValue.trim()
    setSuppressed(true)
    setSuggestions([])
    setLoading(false)
  }

  const resumeLookup = () => {
    lastSelectedRef.current = ''
    setSuppressed(false)
  }

  return { suggestions, loading, lookupEnabled, suppressUntilNextEdit, resumeLookup, suppressed }
}
