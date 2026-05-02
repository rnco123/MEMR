// Encounter Status Types and Constants

export type EncounterStatus =
  | 'appointment_initiated'
  | 'provider_assigned'
  | 'vitals_assessed'
  | 'in_consultation'
  | 'consultation_concluded'
  | 'final_review'
  | 'completed'

export const ENCOUNTER_STATUSES: {
  value: EncounterStatus
  label: string
  description: string
  step: number
  color: string
  icon: string
}[] = [
  {
    value: 'appointment_initiated',
    label: 'Appointment Initiated',
    description: 'When the appointment is first booked',
    step: 1,
    color: 'bg-fuchsia-500',
    icon: '📋',
  },
  {
    value: 'provider_assigned',
    label: 'Provider Assigned',
    description: 'After the nurse assigns the doctor',
    step: 2,
    color: 'bg-blue-700',
    icon: '👨‍⚕️',
  },
  {
    value: 'vitals_assessed',
    label: 'Vitals Assessed',
    description: "Once the nurse has checked the patient's vitals",
    step: 3,
    color: 'bg-lime-500',
    icon: '💉',
  },
  {
    value: 'in_consultation',
    label: 'In Consultation',
    description: 'While the telemedicine session is ongoing',
    step: 4,
    color: 'bg-yellow-400',
    icon: '🎥',
  },
  {
    value: 'consultation_concluded',
    label: 'Consultation Concluded',
    description: 'When the main consultation ends',
    step: 5,
    color: 'bg-red-600',
    icon: '✅',
  },
  {
    value: 'final_review',
    label: 'Final Review',
    description: "During the nurse's post-visit check and wrap-up",
    step: 6,
    color: 'bg-teal-400',
    icon: '📝',
  },
  {
    value: 'completed',
    label: 'Completed',
    description: 'Everything is fully completed and archived',
    step: 7,
    color: 'bg-emerald-500',
    icon: '✔️',
  },
]

/**
 * Left-edge status bar (~6px with `w-1.5`) — hues spread across the spectrum so
 * adjacent steps don’t all read as “blue-purple” on screen.
 */
const STATUS_ACCENT_BAR: Record<EncounterStatus, string> = {
  appointment_initiated: 'bg-fuchsia-500',
  provider_assigned: 'bg-blue-700',
  vitals_assessed: 'bg-lime-500',
  in_consultation: 'bg-yellow-400',
  consultation_concluded: 'bg-red-600',
  final_review: 'bg-teal-400',
  completed: 'bg-emerald-500',
}

/**
 * Tailwind background class for a thin vertical status indicator (full row height).
 * Use on a `w-1.5` element beside the card/row content.
 */
export function getStatusAccentBarClass(status: string | null | undefined): string {
  if (!status) return 'bg-purple-600'
  const key = status as EncounterStatus
  return STATUS_ACCENT_BAR[key] ?? 'bg-orange-500'
}

export function getStatusInfo(status: EncounterStatus) {
  return ENCOUNTER_STATUSES.find((s) => s.value === status)
}

export function getStatusStep(status: EncounterStatus): number {
  return getStatusInfo(status)?.step || 0
}

export function getNextStatus(currentStatus: EncounterStatus): EncounterStatus | null {
  const currentStep = getStatusStep(currentStatus)
  const nextStatus = ENCOUNTER_STATUSES.find((s) => s.step === currentStep + 1)
  return nextStatus?.value || null
}

export function canTransitionTo(from: EncounterStatus, to: EncounterStatus): boolean {
  const fromStep = getStatusStep(from)
  const toStep = getStatusStep(to)
  // Can only move forward one step at a time, or stay same
  return toStep === fromStep + 1 || toStep === fromStep
}

/** Statuses that allow doctor and nurse to join telemedicine (Daily.co) */
const TELEMEDICINE_ELIGIBLE_STATUSES: EncounterStatus[] = [
  'vitals_assessed',
  'in_consultation',
  'consultation_concluded',
  'final_review',
]

/**
 * Doctor and nurse can join telemedicine when vitals have been assessed.
 * Doctor must also be assigned to the encounter (checked separately).
 */
export function canJoinTelemedicine(status: string | null | undefined): boolean {
  if (!status) return false
  return TELEMEDICINE_ELIGIBLE_STATUSES.includes(status as EncounterStatus)
}