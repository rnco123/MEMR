import type { EncounterRxRow } from '@/lib/prescriptions/encounter-prescriptions'

function sigPartIncluded(sig: string, part: string): boolean {
  return sig.toLowerCase().includes(part.toLowerCase())
}

/** US-style SIG line for print / fax prescription sheets. */
export function formatUsRxSig(rx: EncounterRxRow): string {
  const explicit = (rx.dosage_instruction ?? rx.instructions ?? rx.dosage ?? '').trim()
  const route = rx.route?.trim() ?? ''
  const frequency = rx.frequency?.trim() ?? ''
  const duration = rx.duration?.trim() ?? ''

  const structuredParts: string[] = []
  if (route) structuredParts.push(route)
  if (frequency) structuredParts.push(frequency)
  if (duration) structuredParts.push(`for ${duration}`)
  const structuredSig = structuredParts.join(' ')

  if (!explicit) return structuredSig || '—'

  const missingParts: string[] = []
  if (route && !sigPartIncluded(explicit, route)) missingParts.push(route)
  if (frequency && !sigPartIncluded(explicit, frequency)) missingParts.push(frequency)
  if (
    duration &&
    !sigPartIncluded(explicit, duration) &&
    !sigPartIncluded(explicit, `for ${duration}`)
  ) {
    missingParts.push(`for ${duration}`)
  }

  if (missingParts.length === 0) return explicit
  return `${explicit} ${missingParts.join(' ')}`.trim()
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
