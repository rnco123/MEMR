export const VITALS_VALIDATION_RANGES = {
  bp_systolic: { min: 70, max: 250 },
  bp_diastolic: { min: 40, max: 150 },
  heart_rate: { min: 30, max: 220 },
  respiratory_rate: { min: 8, max: 40 },
  temperature_f: { min: 90, max: 110 },
  temperature_c: { min: 32, max: 43 },
  spo2: { min: 0, max: 100 },
  weight_lbs: { min: 1, max: 1000 },
  weight_kg: { min: 0.5, max: 500 },
  height_in: { min: 12, max: 96 },
  height_cm: { min: 30, max: 250 },
} as const

export type VitalsFormInput = {
  bp_systolic: string
  bp_diastolic: string
  heart_rate: string
  respiratory_rate: string
  temperature: string
  temperature_unit: string
  spo2: string
  weight: string
  weight_unit: string
  height: string
  height_unit: string
  notes: string
}

export const EMPTY_VITALS_FORM_INPUT: VitalsFormInput = {
  bp_systolic: '',
  bp_diastolic: '',
  heart_rate: '',
  respiratory_rate: '',
  temperature: '',
  temperature_unit: 'F',
  spo2: '',
  weight: '',
  weight_unit: 'lbs',
  height: '',
  height_unit: 'in',
  notes: '',
}

export const VITALS_FORM_LABEL_CLASS =
  'block text-slate-500 text-xs font-medium uppercase tracking-wide mb-2'

export function vitalsInputClass(hasError?: boolean) {
  return `w-full px-4 py-2.5 bg-[#f9fbff] border rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/35 focus:border-[#2E6EF3] ${
    hasError ? 'border-red-500' : 'border-slate-200'
  }`
}

export function vitalsInputFlexClass(hasError?: boolean) {
  return `flex-1 min-w-0 px-4 py-2.5 bg-[#f9fbff] border rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/35 focus:border-[#2E6EF3] ${
    hasError ? 'border-red-500' : 'border-slate-200'
  }`
}

export const VITALS_FORM_SELECT_CLASS =
  'px-3 py-2.5 bg-[#f9fbff] border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/35 focus:border-[#2E6EF3] min-w-[70px] shrink-0'

export type VitalsFormErrors = Partial<Record<keyof VitalsFormInput, string>>

const VITALS_VALIDATED_FIELDS: (keyof VitalsFormInput)[] = [
  'bp_systolic',
  'bp_diastolic',
  'heart_rate',
  'respiratory_rate',
  'temperature',
  'spo2',
  'weight',
  'height',
]

export function validateVitalsField(
  name: keyof VitalsFormInput,
  value: string,
  data: VitalsFormInput
): string | null {
  if (!value) return null

  const numValue = parseFloat(value)
  if (Number.isNaN(numValue)) return 'Must be a valid number'

  switch (name) {
    case 'bp_systolic':
      if (
        numValue < VITALS_VALIDATION_RANGES.bp_systolic.min ||
        numValue > VITALS_VALIDATION_RANGES.bp_systolic.max
      ) {
        return `Must be between ${VITALS_VALIDATION_RANGES.bp_systolic.min}-${VITALS_VALIDATION_RANGES.bp_systolic.max} mmHg`
      }
      break
    case 'bp_diastolic':
      if (
        numValue < VITALS_VALIDATION_RANGES.bp_diastolic.min ||
        numValue > VITALS_VALIDATION_RANGES.bp_diastolic.max
      ) {
        return `Must be between ${VITALS_VALIDATION_RANGES.bp_diastolic.min}-${VITALS_VALIDATION_RANGES.bp_diastolic.max} mmHg`
      }
      if (data.bp_systolic && parseFloat(data.bp_systolic) <= numValue) {
        return 'Diastolic must be less than systolic'
      }
      break
    case 'heart_rate':
      if (
        numValue < VITALS_VALIDATION_RANGES.heart_rate.min ||
        numValue > VITALS_VALIDATION_RANGES.heart_rate.max
      ) {
        return `Must be between ${VITALS_VALIDATION_RANGES.heart_rate.min}-${VITALS_VALIDATION_RANGES.heart_rate.max} bpm`
      }
      break
    case 'respiratory_rate':
      if (
        numValue < VITALS_VALIDATION_RANGES.respiratory_rate.min ||
        numValue > VITALS_VALIDATION_RANGES.respiratory_rate.max
      ) {
        return `Must be between ${VITALS_VALIDATION_RANGES.respiratory_rate.min}-${VITALS_VALIDATION_RANGES.respiratory_rate.max} breaths/min`
      }
      break
    case 'temperature':
      if (data.temperature_unit === 'F') {
        if (
          numValue < VITALS_VALIDATION_RANGES.temperature_f.min ||
          numValue > VITALS_VALIDATION_RANGES.temperature_f.max
        ) {
          return `Must be between ${VITALS_VALIDATION_RANGES.temperature_f.min}-${VITALS_VALIDATION_RANGES.temperature_f.max}°F`
        }
      } else if (
        numValue < VITALS_VALIDATION_RANGES.temperature_c.min ||
        numValue > VITALS_VALIDATION_RANGES.temperature_c.max
      ) {
        return `Must be between ${VITALS_VALIDATION_RANGES.temperature_c.min}-${VITALS_VALIDATION_RANGES.temperature_c.max}°C`
      }
      break
    case 'spo2':
      if (numValue < VITALS_VALIDATION_RANGES.spo2.min || numValue > VITALS_VALIDATION_RANGES.spo2.max) {
        return `Must be between ${VITALS_VALIDATION_RANGES.spo2.min}-${VITALS_VALIDATION_RANGES.spo2.max}%`
      }
      break
    case 'weight':
      if (data.weight_unit === 'lbs') {
        if (
          numValue < VITALS_VALIDATION_RANGES.weight_lbs.min ||
          numValue > VITALS_VALIDATION_RANGES.weight_lbs.max
        ) {
          return `Must be between ${VITALS_VALIDATION_RANGES.weight_lbs.min}-${VITALS_VALIDATION_RANGES.weight_lbs.max} lbs`
        }
      } else if (
        numValue < VITALS_VALIDATION_RANGES.weight_kg.min ||
        numValue > VITALS_VALIDATION_RANGES.weight_kg.max
      ) {
        return `Must be between ${VITALS_VALIDATION_RANGES.weight_kg.min}-${VITALS_VALIDATION_RANGES.weight_kg.max} kg`
      }
      break
    case 'height':
      if (data.height_unit === 'in') {
        if (
          numValue < VITALS_VALIDATION_RANGES.height_in.min ||
          numValue > VITALS_VALIDATION_RANGES.height_in.max
        ) {
          return `Must be between ${VITALS_VALIDATION_RANGES.height_in.min}-${VITALS_VALIDATION_RANGES.height_in.max} inches`
        }
      } else if (
        numValue < VITALS_VALIDATION_RANGES.height_cm.min ||
        numValue > VITALS_VALIDATION_RANGES.height_cm.max
      ) {
        return `Must be between ${VITALS_VALIDATION_RANGES.height_cm.min}-${VITALS_VALIDATION_RANGES.height_cm.max} cm`
      }
      break
  }

  return null
}

export function validateVitalsForm(data: VitalsFormInput): VitalsFormErrors {
  const errors: VitalsFormErrors = {}

  for (const key of VITALS_VALIDATED_FIELDS) {
    const error = validateVitalsField(key, data[key], data)
    if (error) errors[key] = error
  }

  if (data.bp_systolic && data.bp_diastolic) {
    const systolic = parseFloat(data.bp_systolic)
    const diastolic = parseFloat(data.bp_diastolic)
    if (diastolic >= systolic) {
      errors.bp_diastolic = 'Diastolic must be less than systolic'
    }
  }

  return errors
}
