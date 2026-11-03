'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  fetchServiceAvailability,
  getLocationRules,
  isServiceEnabledOn,
  type ServiceAvailabilityConfig,
  type Surface,
} from './service-availability'

type ServiceLike = { id: number }

/**
 * Reads the admin's Configurations rules and narrows a service list to what a
 * location offers on a given surface.
 *
 * Loaded in an effect rather than during render, so the server-rendered markup and
 * the first client render agree.
 */
export function useServiceAvailability() {
  const [config, setConfig] = useState<ServiceAvailabilityConfig>({})
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setConfig(await fetchServiceAvailability())
    } catch {
      // A failed load must not empty a picker — `filterServicesForLocation` passes
      // the list through when a location has no rules.
      setConfig({})
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Filter a service list for one location and surface.
   *
   * A location with no configured services is treated as "not configured yet" and
   * passes the list through untouched, so this screen never silently empties an
   * existing location's picker.
   */
  const filterServicesForLocation = useCallback(
    <T extends ServiceLike>(
      services: T[],
      locationId: number | null | undefined,
      surface: Surface
    ): T[] => {
      if (locationId == null) return services
      if (getLocationRules(config, locationId).service_ids.length === 0) return services
      return services.filter((service) =>
        isServiceEnabledOn(config, locationId, service.id, surface)
      )
    },
    [config]
  )

  /** True when the admin has assigned any service to this location. */
  const isLocationConfigured = useCallback(
    (locationId: number | null | undefined): boolean =>
      locationId != null && getLocationRules(config, locationId).service_ids.length > 0,
    [config]
  )

  return { config, loaded, refresh, filterServicesForLocation, isLocationConfigured }
}
