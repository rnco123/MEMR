/**
 * Shared encounter / patient authorization helpers (H-01, H-02).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthorizationError } from '@/lib/api-error-handler'
import { fetchUserRole } from '@/lib/fetch-user-role'
import { mapRoleToEnum, UserRole, isPhysicianRole } from '@/lib/roles'
import { getLocationScopeForUser, isAllowedByLocationScope } from '@/lib/locations/scope'

export type EncounterAccessOptions = {
  /** When true (default), doctors must be assigned to the encounter. */
  requireDoctorAssignment?: boolean
}

function resolveNestedLocationId(
  row: { location_id?: number | null } | null | undefined
): number | null {
  if (!row || row.location_id == null) return null
  return row.location_id
}

async function resolveDoctorRowId(
  adminClient: SupabaseClient,
  userId: string
): Promise<number | null> {
  const { data } = await adminClient
    .from('doctors')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.id ?? null
}

/**
 * Verifies that `userId` may access the given encounter.
 *
 * Rules:
 * - Admin: unrestricted.
 * - Doctor / Nurse: encounter location (appointment or patient) must be in scope.
 * - Unassigned location: denied for non-admin.
 * - Doctor: must be assigned to encounter when `requireDoctorAssignment` is true.
 */
export async function assertEncounterAccess(
  adminClient: SupabaseClient,
  userId: string,
  encounterId: number,
  options: EncounterAccessOptions = {}
): Promise<void> {
  const requireDoctorAssignment = options.requireDoctorAssignment !== false

  const profileRow = await fetchUserRole(adminClient, userId)
  const role = mapRoleToEnum(profileRow?.role ?? '')

  if (!role) {
    throw new AuthorizationError('Insufficient role for encounter access')
  }

  if (role === UserRole.ADMIN) return

  const { data: encounter, error: encErr } = await adminClient
    .from('encounters')
    .select('id, doctor_id, appointment_id, appointments(location_id), patients(location_id)')
    .eq('id', encounterId)
    .maybeSingle()

  if (encErr || !encounter) {
    throw new AuthorizationError('Encounter not found or access denied')
  }

  const appt = Array.isArray(encounter.appointments)
    ? encounter.appointments[0]
    : encounter.appointments
  const patient = Array.isArray(encounter.patients)
    ? encounter.patients[0]
    : encounter.patients

  const effectiveLocationId =
    resolveNestedLocationId(appt as { location_id?: number | null }) ??
    resolveNestedLocationId(patient as { location_id?: number | null })

  if (effectiveLocationId == null) {
    throw new AuthorizationError('Encounter location not assigned; access denied')
  }

  const scope = await getLocationScopeForUser(adminClient, userId, role)
  if (!isAllowedByLocationScope(scope, effectiveLocationId)) {
    throw new AuthorizationError('Access denied: encounter belongs to a different location')
  }

  if (isPhysicianRole(role) && requireDoctorAssignment) {
    const doctorRowId = await resolveDoctorRowId(adminClient, userId)
    if (!doctorRowId || encounter.doctor_id !== doctorRowId) {
      throw new AuthorizationError('You are not assigned to this encounter')
    }
  }
}

/** Verifies clinical user may access a patient record by location scope. */
export async function assertPatientAccess(
  adminClient: SupabaseClient,
  userId: string,
  patientId: number
): Promise<void> {
  const profileRow = await fetchUserRole(adminClient, userId)
  const role = mapRoleToEnum(profileRow?.role ?? '')

  if (!role) {
    throw new AuthorizationError('Insufficient role for patient access')
  }

  if (role === UserRole.ADMIN) return

  const { data: patient, error } = await adminClient
    .from('patients')
    .select('id, location_id')
    .eq('id', patientId)
    .maybeSingle()

  if (error || !patient) {
    throw new AuthorizationError('Patient not found or access denied')
  }

  if (patient.location_id == null) {
    throw new AuthorizationError('Patient location not assigned; access denied')
  }

  const scope = await getLocationScopeForUser(adminClient, userId, role)
  if (!isAllowedByLocationScope(scope, patient.location_id)) {
    throw new AuthorizationError('Access denied: patient belongs to a different location')
  }
}

/** Load encounter id from an order row and assert access. */
export async function assertOrderAccess(
  adminClient: SupabaseClient,
  userId: string,
  orderId: number
): Promise<number> {
  const { data: order, error } = await adminClient
    .from('encounter_orders')
    .select('encounter_id')
    .eq('id', orderId)
    .maybeSingle()

  if (error || !order?.encounter_id) {
    throw new AuthorizationError('Order not found or access denied')
  }

  const encounterId = Number(order.encounter_id)
  await assertEncounterAccess(adminClient, userId, encounterId)
  return encounterId
}

/** Load task scope and assert encounter or patient access. */
export async function assertPostVisitTaskAccess(
  adminClient: SupabaseClient,
  userId: string,
  taskId: number
): Promise<void> {
  const { data: task, error } = await adminClient
    .from('post_visit_tasks')
    .select('encounter_id, patient_id')
    .eq('id', taskId)
    .maybeSingle()

  if (error || !task) {
    throw new AuthorizationError('Task not found or access denied')
  }

  if (task.encounter_id != null) {
    await assertEncounterAccess(adminClient, userId, Number(task.encounter_id))
    return
  }

  if (task.patient_id != null) {
    await assertPatientAccess(adminClient, userId, Number(task.patient_id))
    return
  }

  throw new AuthorizationError('Task not found or access denied')
}
