/**
 * Admin → Configurations: which surfaces a clinic location serves, and which services
 * it offers.
 *
 * The rules live in `location_configurations` and `location_services`, reached through
 * mcm-bridge. A service is available on a surface when it is assigned to the location
 * *and* that location has the surface enabled — the surface sits on the location, so
 * one switch covers a whole clinic rather than every service individually.
 */

export type Surface = 'portal' | 'emr'

export const SURFACES: readonly Surface[] = ['portal', 'emr']

export type LocationRules = {
  portal_enabled: boolean
  emr_enabled: boolean
  /** Service ids offered here. Assigning adds one; removing drops it. */
  service_ids: number[]
}

/** locationId (as string) → its rules. */
export type ServiceAvailabilityConfig = Record<string, LocationRules>

export const DEFAULT_RULES: LocationRules = {
  portal_enabled: false,
  emr_enabled: true,
  service_ids: [],
}

export function isSurface(value: unknown): value is Surface {
  return value === 'portal' || value === 'emr'
}

/** Drop anything that isn't a well-formed rules entry. */
export function normalizeServiceAvailability(raw: unknown): ServiceAvailabilityConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const config: ServiceAvailabilityConfig = {}

  for (const [locationId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(locationId)) continue
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue

    const rules = value as Partial<LocationRules>
    const ids = Array.isArray(rules.service_ids) ? rules.service_ids : []

    config[locationId] = {
      portal_enabled: rules.portal_enabled === true,
      emr_enabled: rules.emr_enabled !== false,
      service_ids: [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))].sort(
        (a, b) => a - b
      ),
    }
  }

  return config
}

/** Shape returned by the bridge, via this app's API route. */
type ConfigurationRow = {
  location_id: number
  portal_enabled: boolean
  emr_enabled: boolean
  service_ids: number[]
}

export function configFromRows(rows: ConfigurationRow[]): ServiceAvailabilityConfig {
  const config: ServiceAvailabilityConfig = {}
  for (const row of rows ?? []) {
    config[String(row.location_id)] = {
      portal_enabled: row.portal_enabled,
      emr_enabled: row.emr_enabled,
      service_ids: [...(row.service_ids ?? [])].sort((a, b) => a - b),
    }
  }
  return config
}

export async function fetchServiceAvailability(): Promise<ServiceAvailabilityConfig> {
  const response = await fetch('/api/admin/configurations', { credentials: 'include' })
  const body = await response.json()
  if (!response.ok) throw new Error(body?.error || 'Failed to load configurations')
  return configFromRows(body.data ?? [])
}

/** Persist one location's rules. The server replaces that location's assignments. */
export async function saveLocationRules(
  locationId: number,
  rules: LocationRules
): Promise<LocationRules> {
  const response = await fetch(`/api/admin/configurations/${locationId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      portal_enabled: rules.portal_enabled,
      emr_enabled: rules.emr_enabled,
      service_ids: rules.service_ids,
    }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body?.error || 'Failed to save configuration')

  const saved = body.data as ConfigurationRow
  return {
    portal_enabled: saved.portal_enabled,
    emr_enabled: saved.emr_enabled,
    service_ids: [...(saved.service_ids ?? [])].sort((a, b) => a - b),
  }
}

export function getLocationRules(
  config: ServiceAvailabilityConfig,
  locationId: number | string
): LocationRules {
  return config[String(locationId)] ?? DEFAULT_RULES
}

export function isServiceAssigned(
  config: ServiceAvailabilityConfig,
  locationId: number | string,
  serviceId: number | string
): boolean {
  return getLocationRules(config, locationId).service_ids.includes(Number(serviceId))
}

/** Assign or unassign one service at one location. Returns a new config. */
export function setServiceAssigned(
  config: ServiceAvailabilityConfig,
  locationId: number | string,
  serviceId: number | string,
  assigned: boolean
): ServiceAvailabilityConfig {
  const key = String(locationId)
  const current = getLocationRules(config, locationId)
  const id = Number(serviceId)

  const service_ids = assigned
    ? [...new Set([...current.service_ids, id])].sort((a, b) => a - b)
    : current.service_ids.filter((existing) => existing !== id)

  return { ...config, [key]: { ...current, service_ids } }
}

/** Replace the assigned services for one location. Returns a new config. */
export function setLocationServices(
  config: ServiceAvailabilityConfig,
  locationId: number | string,
  serviceIds: number[]
): ServiceAvailabilityConfig {
  const key = String(locationId)
  return {
    ...config,
    [key]: {
      ...getLocationRules(config, locationId),
      service_ids: [...new Set(serviceIds.map(Number))].sort((a, b) => a - b),
    },
  }
}

/** Turn a surface on or off for one location. Returns a new config. */
export function setLocationSurface(
  config: ServiceAvailabilityConfig,
  locationId: number | string,
  surface: Surface,
  enabled: boolean
): ServiceAvailabilityConfig {
  const key = String(locationId)
  const current = getLocationRules(config, locationId)
  return {
    ...config,
    [key]: {
      ...current,
      ...(surface === 'portal' ? { portal_enabled: enabled } : { emr_enabled: enabled }),
    },
  }
}

export function countLocationAssignments(
  config: ServiceAvailabilityConfig,
  locationId: number | string
): number {
  return getLocationRules(config, locationId).service_ids.length
}

/**
 * True when a location offers the service on the given surface — assigned, and the
 * location serves that surface.
 */
export function isServiceEnabledOn(
  config: ServiceAvailabilityConfig,
  locationId: number | string,
  serviceId: number | string,
  surface: Surface
): boolean {
  const rules = getLocationRules(config, locationId)
  const surfaceOn = surface === 'portal' ? rules.portal_enabled : rules.emr_enabled
  return surfaceOn && rules.service_ids.includes(Number(serviceId))
}

export function sameRules(a: LocationRules, b: LocationRules): boolean {
  return (
    a.portal_enabled === b.portal_enabled &&
    a.emr_enabled === b.emr_enabled &&
    a.service_ids.length === b.service_ids.length &&
    a.service_ids.every((id, i) => id === b.service_ids[i])
  )
}

export function sameConfig(a: ServiceAvailabilityConfig, b: ServiceAvailabilityConfig): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => b[key] != null && sameRules(a[key]!, b[key]!))
}
