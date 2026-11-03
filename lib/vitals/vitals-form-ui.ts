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

/** i18n `t` from useT(); messages live under `vitals.err_*`. */
export type VitalsTranslate = (key: string, vars?: Record<string, string | number>) => string

function rangeError(
  t: VitalsTranslate,
  numValue: number,
  range: { min: number; max: number },
  unit: string
): string | null {
  if (numValue < range.min || numValue > range.max) {
    return t('vitals.err_range', { min: range.min, max: range.max, unit })
  }
  return null
}

export function validateVitalsField(
  name: keyof VitalsFormInput,
  value: string,
  data: VitalsFormInput,
  t: VitalsTranslate
): string | null {
  if (!value) return null

  const numValue = parseFloat(value)
  if (Number.isNaN(numValue)) return t('vitals.err_number')

  const R = VITALS_VALIDATION_RANGES
  switch (name) {
    case 'bp_systolic':
      return rangeError(t, numValue, R.bp_systolic, 'mmHg')
    case 'bp_diastolic': {
      const outOfRange = rangeError(t, numValue, R.bp_diastolic, 'mmHg')
      if (outOfRange) return outOfRange
      if (data.bp_systolic && parseFloat(data.bp_systolic) <= numValue) {
        return t('vitals.err_diastolic')
      }
      return null
    }
    case 'heart_rate':
      return rangeError(t, numValue, R.heart_rate, 'bpm')
    case 'respiratory_rate':
      return rangeError(t, numValue, R.respiratory_rate, t('vitals.unit_breaths'))
    case 'temperature':
      return data.temperature_unit === 'F'
        ? rangeError(t, numValue, R.temperature_f, '°F')
        : rangeError(t, numValue, R.temperature_c, '°C')
    case 'spo2':
      return rangeError(t, numValue, R.spo2, '%')
    case 'weight':
      return data.weight_unit === 'lbs'
        ? rangeError(t, numValue, R.weight_lbs, 'lbs')
        : rangeError(t, numValue, R.weight_kg, 'kg')
    case 'height':
      return data.height_unit === 'in'
        ? rangeError(t, numValue, R.height_in, t('vitals.unit_inches'))
        : rangeError(t, numValue, R.height_cm, 'cm')
  }

  return null
}

/**
 * Validate the vitals form. `requireAll` (on save) also flags empty fields — every
 * vital is required before the encounter can move to Vitals assessed.
 */
export function validateVitalsForm(
  data: VitalsFormInput,
  t: VitalsTranslate,
  options: { requireAll?: boolean } = {}
): VitalsFormErrors {
  const errors: VitalsFormErrors = {}

  for (const key of VITALS_VALIDATED_FIELDS) {
    if (options.requireAll && !data[key].trim()) {
      errors[key] = t('vitals.err_required')
      continue
    }
    const error = validateVitalsField(key, data[key], data, t)
    if (error) errors[key] = error
  }

  return errors
}
