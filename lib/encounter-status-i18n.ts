import type { EncounterStatus } from '@/lib/encounter-status'
import { ENCOUNTER_STATUSES } from '@/lib/encounter-status'

const STATUS_I18N_KEYS: Record<EncounterStatus, string> = {
  appointment_initiated: 'encounter.status.appointment_initiated',
  provider_assigned: 'encounter.status.provider_assigned',
  vitals_assessed: 'encounter.status.vitals_assessed',
  in_consultation: 'encounter.status.in_consultation',
  consultation_concluded: 'encounter.status.consultation_concluded',
  final_review: 'encounter.status.final_review',
  completed: 'encounter.status.completed',
}

type TranslateFn = (key: string) => string

export function translateEncounterStatus(
  t: TranslateFn,
  status: string | null | undefined
): string {
  if (!status) return t('flow.not_started')
  const key = STATUS_I18N_KEYS[status as EncounterStatus]
  if (key) return t(key)
  return ENCOUNTER_STATUSES.find((s) => s.value === status)?.label ?? status
}
