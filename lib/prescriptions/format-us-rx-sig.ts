import type { EncounterRxRow } from '@/lib/prescriptions/encounter-prescriptions'

/** US-style SIG line for print / fax prescription sheets. */
export function formatUsRxSig(rx: EncounterRxRow): string {
  const explicit = (rx.dosage_instruction ?? rx.instructions ?? rx.dosage ?? '').trim()
  if (explicit) return explicit

  const parts: string[] = []
  if (rx.route?.trim()) parts.push(rx.route.trim())
  if (rx.frequency?.trim()) parts.push(rx.frequency.trim())
  if (rx.duration?.trim()) parts.push(`for ${rx.duration.trim()}`)
  return parts.join(' ') || '—'
}

export function formatUsRxMedicationLine(rx: EncounterRxRow): string {
  const name = rx.medication_name.trim() || '—'
  const strength = rx.strength?.trim()
  return strength ? `${name} ${strength}` : name
}

export function formatUsRxDispense(rx: EncounterRxRow): string {
  const qty = rx.quantity?.trim()
  if (qty) return qty
  return '—'
}
