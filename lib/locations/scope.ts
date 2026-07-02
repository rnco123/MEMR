import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { fetchAllLocations } from '@/lib/locations/fetch-all'
import { UserRole, mapRoleToEnum, isPhysicianRole } from '@/lib/roles'

export type LocationRow = {
  id: number
  title: string
  address?: string | null
  location_code?: string | null
  phone?: string | null
  email?: string | null
  opening_hours?: string | null
  google_map_url?: string | null
  is_active?: boolean
}

export type LocationScope = {
  unrestricted: boolean
  locationIds: number[]
}

/** Roles allowed on clinical location-scoped APIs. */
export function resolveClinicalApiRole(role: string | null | undefined): UserRole | null {
  const mapped = mapRoleToEnum(role)
  if (
    mapped === UserRole.ADMIN ||
    mapped === UserRole.DOCTOR ||
    mapped === UserRole.FNP ||
    mapped === UserRole.PA ||
    mapped === UserRole.NURSE
  ) {
    return mapped
  }
  return null
}

/** Admin sees all locations; clinical staff are limited to assigned locations. */
export async function getLocationScopeForUser(
  admin: SupabaseClient,
  userId: string,
  role: string | UserRole
): Promise<LocationScope> {
  const resolved = mapRoleToEnum(String(role))
  if (resolved === UserRole.ADMIN) {
    return { unrestricted: true, locationIds: [] }
  }

  if (
    resolved !== UserRole.DOCTOR &&
    resolved !== UserRole.FNP &&
    resolved !== UserRole.PA &&
    resolved !== UserRole.NURSE
  ) {
    return { unrestricted: false, locationIds: [] }
  }

  const { data: rows } = await admin
    .from('user_locations')
    .select('location_id')
    .eq('user_uid', userId)

  const ids = new Set<number>(
    (rows ?? [])
      .map((r) => r.location_id)
      .filter((id): id is number => typeof id === 'number')
  )

  if (ids.size === 0) {
    const table = isPhysicianRole(resolved) ? 'doctors' : 'nurses'
    const { data: staffRow } = await admin
      .from(table)
      .select('location_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (staffRow?.location_id != null) {
      ids.add(staffRow.location_id as number)
    }
  }

  return { unrestricted: false, locationIds: [...ids] }
}

export async function getAssignedLocations(
  admin: SupabaseClient,
  userId: string,
  role: string | UserRole
): Promise<LocationRow[]> {
  const scope = await getLocationScopeForUser(admin, userId, String(role))

  if (scope.unrestricted) {
    return fetchAllLocations(admin)
  }

  if (scope.locationIds.length === 0) return []

  const { data } = await admin
    .from('locations')
    .select('id, title, address, location_code, phone, email, opening_hours, google_map_url, is_active')
    .in('id', scope.locationIds)
    .eq('is_active', true)
    .order('title')

  return (data ?? []) as LocationRow[]
}

export function resolveEffectiveLocationId(
  patientLocationId: number | null | undefined,
  appointmentLocationId: number | null | undefined
): number | null {
  if (patientLocationId != null) return patientLocationId
  if (appointmentLocationId != null) return appointmentLocationId
  return null
}

export function isAllowedByLocationScope(
  scope: LocationScope,
  effectiveLocationId: number | null
): boolean {
  if (scope.unrestricted) return true
  if (scope.locationIds.length === 0) return false
  if (effectiveLocationId == null) return false
  return scope.locationIds.includes(effectiveLocationId)
}

/**
 * Multi-location variant: a provider/record with several locations is in scope
 * when ANY of its locations is allowed. Providers (doctor/fnp/pa) work across
 * multiple clinics via the admin-assigned `user_locations`, so assignment must
 * match on any of those — the single home `doctors.location_id` is irrelevant.
 */
export function scopeAllowsAnyLocation(
  scope: LocationScope,
  locationIds: Array<number | null | undefined>
): boolean {
  if (scope.unrestricted) return true
  if (scope.locationIds.length === 0) return false
  return locationIds.some(
    (id) => id != null && scope.locationIds.includes(Number(id))
  )
}

/**
 * Load the admin-assigned location ids for a batch of users from
 * `user_locations`. Returns a map keyed by user uid. This is the authoritative
 * source for where a provider works — a user absent from the map has no
 * assigned locations and is assignable nowhere (home `location_id` is ignored).
 */
export async function fetchUserLocationsMap(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>()
  const unique = [...new Set(userIds.filter(Boolean))]
  if (unique.length === 0) return map

  const { data } = await admin
    .from('user_locations')
    .select('user_uid, location_id')
    .in('user_uid', unique)

  for (const row of data ?? []) {
    const uid = row.user_uid as string | null
    const loc = row.location_id
    if (!uid || typeof loc !== 'number') continue
    const list = map.get(uid)
    if (list) list.push(loc)
    else map.set(uid, [loc])
  }
  return map
}

export function parseLocationFilter(
  scope: LocationScope,
  locationIdParam: string | null
): number | null | undefined {
  if (!locationIdParam || locationIdParam === 'all') return undefined
  const id = Number(locationIdParam)
  if (!Number.isFinite(id) || id <= 0) return undefined
  if (!scope.unrestricted && !scope.locationIds.includes(id)) {
    return null
  }
  return id
}

export async function requireClinicalRole(
  supabase: SupabaseClient,
  userId: string
): Promise<UserRole> {
  const profile = await fetchUserRole(supabase, userId)
  const resolved = resolveClinicalApiRole(profile?.role)
  if (!resolved) {
    throw new Error('FORBIDDEN')
  }
  return resolved
}
