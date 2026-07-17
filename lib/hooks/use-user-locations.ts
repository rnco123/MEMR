'use client'

import { useCallback, useEffect, useState } from 'react'

export type UserLocation = {
  id: number
  title: string
  tenant_id?: number | null
  address?: string | null
  location_code?: string | null
}

export function useUserLocations() {
  const [locations, setLocations] = useState<UserLocation[]>([])
  const [locationIds, setLocationIds] = useState<number[]>([])
  const [unrestricted, setUnrestricted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedLocationId, setSelectedLocationId] = useState<number | 'all'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/me/locations', { credentials: 'include' })
      const json = await res.json()
      if (res.ok) {
        setLocations(json.locations ?? [])
        setLocationIds(Array.isArray(json.locationIds) ? json.locationIds : [])
        setUnrestricted(!!json.unrestricted)
      }
    } catch {
      setLocations([])
      setLocationIds([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const locationQuery =
    selectedLocationId === 'all' ? '' : `location_id=${selectedLocationId}`

  return {
    locations,
    locationIds,
    unrestricted,
    loading,
    selectedLocationId,
    setSelectedLocationId,
    locationQuery,
    reload: load,
  }
}
