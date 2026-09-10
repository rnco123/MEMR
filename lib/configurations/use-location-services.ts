'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type ServiceRow = { id: number; title_en?: string | null; title_es?: string | null }

/**
 * The services a location offers, as configured in Admin → Configurations.
 *
 * Reads the staff endpoint rather than the admin one, so a nurse sees the same list
 * an administrator configured without needing admin rights.
 *
 * Returns `null` until an answer arrives, and on failure. Callers treat `null` as
 * "no rules known" and show their full list — a lookup problem must never leave
 * someone unable to pick a service.
 */
export function useLocationServices(locationId: number | null | undefined) {
  const [serviceIds, setServiceIds] = useState<Set<number> | null>(null)
  const requested = useRef<number | null>(null)

  const load = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/locations/${id}/services`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !Array.isArray(json.services)) {
        setServiceIds(null)
        return
      }
      setServiceIds(new Set((json.services as ServiceRow[]).map((s) => Number(s.id))))
    } catch {
      setServiceIds(null)
    }
  }, [])

  useEffect(() => {
    if (locationId == null) {
      setServiceIds(null)
      return
    }
    if (requested.current === locationId) return
    requested.current = locationId
    void load(locationId)
  }, [locationId, load])

  /** Narrow a service list to what this location offers. */
  const filterServices = useCallback(
    <T extends { id: number }>(services: T[]): T[] =>
      serviceIds == null ? services : services.filter((s) => serviceIds.has(s.id)),
    [serviceIds]
  )

  return { serviceIds, filterServices }
}
