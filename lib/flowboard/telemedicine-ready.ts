import { canJoinTelemedicine } from '@/lib/encounter-status'

export type TelemedicineReadyRow = {
  encounter_id?: number | null
  encounter_status?: string | null
  ready_for_doctor_at?: string | null
}

/**
 * A patient is ready for the provider when the nurse has both:
 *  - saved vitals (which advances the encounter to `vitals_assessed` or later), and
 *  - checked "Ready for doctor" in Rooming (which stamps `ready_for_doctor_at`).
 *
 * `canJoinTelemedicine` already excludes the pre-vitals and completed statuses.
 */
export function isReadyForTelemedicine(row: TelemedicineReadyRow): boolean {
  if (!row.encounter_id) return false
  if (!row.ready_for_doctor_at) return false
  return canJoinTelemedicine(row.encounter_status)
}

/** Longest wait first — the patient marked ready earliest is at the top. */
export function compareReadySinceAsc(a: TelemedicineReadyRow, b: TelemedicineReadyRow): number {
  const at = a.ready_for_doctor_at ? Date.parse(a.ready_for_doctor_at) : 0
  const bt = b.ready_for_doctor_at ? Date.parse(b.ready_for_doctor_at) : 0
  return (Number.isNaN(at) ? 0 : at) - (Number.isNaN(bt) ? 0 : bt)
}

/** Whole minutes a patient has been waiting since rooming marked them ready. */
export function readyWaitMinutes(
  readyAt: string | null | undefined,
  now: number = Date.now()
): number | null {
  if (!readyAt) return null
  const stamped = Date.parse(readyAt)
  if (Number.isNaN(stamped)) return null
  return Math.max(0, Math.floor((now - stamped) / 60000))
}
