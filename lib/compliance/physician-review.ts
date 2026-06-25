/**
 * Types for encounter-level physician audit (see migration 089).
 */

export type PhysicianReviewStatus =
  | 'not_required'
  | 'pending'
  | 'reviewed'
  | 'consult_concluded'
  | 'physician_signed'

export type EncounterPhysicianReviewRow = {
  id: number
  encounter_id: number
  patient_id: number
  documenting_user_id: string
  review_status: PhysicianReviewStatus
  reviewed_by_user_id: string | null
  reviewed_at: string | null
  notes: string | null
  findings: string | null
  created_at: string
  updated_at: string
}

/** Completed review statuses for 10% compliance numerator. */
export const PHYSICIAN_REVIEW_COMPLETE_STATUSES: PhysicianReviewStatus[] = [
  'reviewed',
  'consult_concluded',
  'physician_signed',
]

export function isPhysicianReviewComplete(status: PhysicianReviewStatus): boolean {
  return PHYSICIAN_REVIEW_COMPLETE_STATUSES.includes(status)
}

/** Required reviews = ceil(total NP/PA encounters × 10%). */
export function requiredReviewCount(totalEncounters: number, rate = 0.1): number {
  if (totalEncounters <= 0) return 0
  return Math.ceil(totalEncounters * rate)
}

export function remainingReviewCount(required: number, completed: number): number {
  return Math.max(0, required - completed)
}

export function reviewPercentage(completed: number, required: number): number {
  if (required <= 0) return 100
  return parseFloat(((completed / required) * 100).toFixed(1))
}
