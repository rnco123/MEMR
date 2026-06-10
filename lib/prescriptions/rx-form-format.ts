import { DURATION_UNITS, QUANTITY_UNITS, STRENGTH_UNITS } from '@/lib/prescriptions/rx-form-options'

export type StructuredRxForm = {
  medication_name: string
  strength_value: string
  strength_unit: string
  dosage_instruction: string
  route: string
  frequency: string
  duration_amount: string
  duration_unit: string
  quantity_amount: string
  quantity_unit: string
  refills: string
  notes: string
}

export const emptyStructuredRxForm = (): StructuredRxForm => ({
  medication_name: '',
  strength_value: '',
  strength_unit: 'mg',
  dosage_instruction: '',
  route: '',
  frequency: '',
  duration_amount: '',
  duration_unit: 'days',
  quantity_amount: '',
  quantity_unit: 'tablets',
  refills: '0',
  notes: '',
})

function normalizeUnit(unit: string, allowed: readonly string[]): string {
  const lower = unit.toLowerCase()
  const hit = allowed.find((u) => u.toLowerCase() === lower)
  return hit ?? allowed[0]!
}

export function formatStrength(form: StructuredRxForm): string | null {
  const amount = form.strength_value.trim()
  if (!amount) return null
  return `${amount} ${form.strength_unit}`.trim()
}

export function parseStrength(value: string | null | undefined): Pick<
  StructuredRxForm,
  'strength_value' | 'strength_unit'
> {
  const raw = (value ?? '').trim()
  if (!raw) return { strength_value: '', strength_unit: 'mg' }

  const match = raw.match(/^([\d.]+)\s*(mg|mcg|g|ml|%|units?)$/i)
  if (match) {
    const unitRaw = match[2]!.toLowerCase()
    const unit = unitRaw === 'ml' ? 'mL' : unitRaw.startsWith('unit') ? 'units' : unitRaw
    return {
      strength_value: match[1]!,
      strength_unit: normalizeUnit(unit, STRENGTH_UNITS),
    }
  }

  return { strength_value: raw, strength_unit: 'mg' }
}

export function formatDuration(form: StructuredRxForm): string | null {
  const amount = form.duration_amount.trim()
  if (!amount) return null
  return `${amount} ${form.duration_unit}`
}

export function parseDuration(value: string | null | undefined): Pick<
  StructuredRxForm,
  'duration_amount' | 'duration_unit'
> {
  const raw = (value ?? '').trim()
  if (!raw) return { duration_amount: '', duration_unit: 'days' }

  const match = raw.match(/^([\d.]+)\s*(days?|weeks?|months?)$/i)
  if (match) {
    let unit = match[2]!.toLowerCase()
    if (unit.endsWith('s')) unit = unit.slice(0, -1)
    if (unit === 'day') unit = 'days'
    if (unit === 'week') unit = 'weeks'
    if (unit === 'month') unit = 'months'
    return {
      duration_amount: match[1]!,
      duration_unit: normalizeUnit(unit, DURATION_UNITS),
    }
  }

  return { duration_amount: raw, duration_unit: 'days' }
}

export function formatQuantity(form: StructuredRxForm): string | null {
  const amount = form.quantity_amount.trim()
  if (!amount) return null
  return `${amount} ${form.quantity_unit}`
}

export function parseQuantity(value: string | null | undefined): Pick<
  StructuredRxForm,
  'quantity_amount' | 'quantity_unit'
> {
  const raw = (value ?? '').trim()
  if (!raw) return { quantity_amount: '', quantity_unit: 'tablets' }

  const match = raw.match(/^([\d.]+)\s*(.+)$/i)
  if (match) {
    const unitRaw = match[2]!.trim().toLowerCase()
    const hit = QUANTITY_UNITS.find((u) => u.toLowerCase() === unitRaw)
    return {
      quantity_amount: match[1]!,
      quantity_unit: hit ?? match[2]!.trim(),
    }
  }

  return { quantity_amount: raw, quantity_unit: 'tablets' }
}

export function structuredFormToApiPayload(form: StructuredRxForm) {
  return {
    medication_name: form.medication_name.trim(),
    strength: formatStrength(form),
    dosage_instruction: form.dosage_instruction.trim() || null,
    route: form.route.trim() || null,
    frequency: form.frequency.trim() || null,
    duration: formatDuration(form),
    quantity: formatQuantity(form),
    refills: Math.min(12, Math.max(0, Number(form.refills) || 0)),
    notes: form.notes.trim() || null,
  }
}

export function rowToStructuredForm(row: {
  medication_name: string
  strength: string | null
  dosage_instruction: string | null
  route: string | null
  frequency: string | null
  duration: string | null
  quantity: string | null
  refills: number
  notes: string | null
}): StructuredRxForm {
  return {
    medication_name: row.medication_name,
    ...parseStrength(row.strength),
    dosage_instruction: row.dosage_instruction ?? '',
    route: row.route ?? '',
    frequency: row.frequency ?? '',
    ...parseDuration(row.duration),
    ...parseQuantity(row.quantity),
    refills: String(row.refills ?? 0),
    notes: row.notes ?? '',
  }
}
