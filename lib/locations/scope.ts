import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { fetchAllLocations } from '@/lib/locations/fetch-all'
import { mapRoleToEnum, UserRole } from '@/lib/roles'

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

/** Roles allowed on clinical location-scoped APIs (admin is unrestricted). */
export function resolveClinicalApiRole(role: string | null | undefined): UserRole | null {
  const mapped = mapRoleToEnum(role)
  if (
    mapped === UserRole.ADMIN ||
    mapped === UserRole.DOCTOR ||
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

  if (resolved !== UserRole.DOCTOR && resolved !== UserRole.NURSE) {
    return { unrestricted: false, locationIds: [] }
  }

  const staffRole = resolved === UserRole.DOCTOR ? 'doctor' : 'nurse'

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
    const table = staffRole === 'doctor' ? 'doctors' : 'nurses'
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
