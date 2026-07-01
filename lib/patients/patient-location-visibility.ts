import type { SupabaseClient } from '@supabase/supabase-js'
import type { LocationScope } from '@/lib/locations/scope'
import { getLocationScopeForUser, isAllowedByLocationScope } from '@/lib/locations/scope'
import { UserRole, isPhysicianRole, mapRoleToEnum } from '@/lib/roles'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { isEncounterCompleted, resolveDoctorRowId } from '@/lib/encounters/access-helpers'

/** Patient visible when home clinic or any visit is in the user's assigned locations. */
export async function isPatientVisibleInScope(
  admin: SupabaseClient,
  patientId: number,
  patientLocationId: number | null | undefined,
  scope: LocationScope
): Promise<boolean> {
  if (scope.unrestricted) return true
  if (scope.locationIds.length === 0) return false

  if (patientLocationId != null && scope.locationIds.includes(patientLocationId)) {
    return true
  }

  const { count, error } = await admin
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', patientId)
    .in('location_id', scope.locationIds)

  if (error) throw error
  return (count ?? 0) > 0
}

/** Distinct patient ids at assigned locations (home clinic or any appointment). */
export async function listPatientIdsVisibleInScope(
  admin: SupabaseClient,
  scope: LocationScope
): Promise<number[] | null> {
  if (scope.unrestricted) return null

  if (scope.locationIds.length === 0) return []

  const ids = new Set<number>()

  const { data: homePatients, error: homeErr } = await admin
    .from('patients')
    .select('id')
    .in('location_id', scope.locationIds)

  if (homeErr) throw homeErr
  for (const row of homePatients ?? []) {
    if (row.id != null) ids.add(Number(row.id))
  }

  const { data: visitPatients, error: visitErr } = await admin
    .from('appointments')
    .select('patient_id')
    .in('location_id', scope.locationIds)

  if (visitErr) throw visitErr
  for (const row of visitPatients ?? []) {
    if (row.patient_id != null) ids.add(Number(row.patient_id))
  }

  return [...ids]
}

type EncounterVisibilityRow = {
  id?: number
  status?: string | null
  doctor_id?: number | null
  appointments?: { location_id?: number | null } | { location_id?: number | null }[] | null
  patients?: { location_id?: number | null } | { location_id?: number | null }[] | null
}

function encounterEffectiveLocationId(enc: EncounterVisibilityRow): number | null {
  const appt = Array.isArray(enc.appointments) ? enc.appointments[0] : enc.appointments
  const patient = Array.isArray(enc.patients) ? enc.patients[0] : enc.patients
  if (appt?.location_id != null) return appt.location_id
  if (patient?.location_id != null) return patient.location_id
  return null
}

/**
 * Patient history: completed encounters at scope for all clinical staff.
 * Active encounters: assigned physician + nurses at scope (not other physicians).
 */
export async function filterEncountersForClinicalViewer<T extends EncounterVisibilityRow>(
  admin: SupabaseClient,
  userId: string,
  encounters: T[]
): Promise<T[]> {
  const profileRow = await fetchUserRole(admin, userId)
  const role = mapRoleToEnum(profileRow?.role ?? '')
  if (!role || role === UserRole.ADMIN) return encounters

  const scope = await getLocationScopeForUser(admin, userId, role)
  const doctorRowId = isPhysicianRole(role) ? await resolveDoctorRowId(admin, userId) : null

  return encounters.filter((enc) => {
    const loc = encounterEffectiveLocationId(enc)
    if (!isAllowedByLocationScope(scope, loc)) return false

    if (isEncounterCompleted(enc.status)) return true

    if (role === UserRole.NURSE) return true

    if (isPhysicianRole(role)) {
      return doctorRowId != null && enc.doctor_id === doctorRowId
    }

    return false
  })
}
