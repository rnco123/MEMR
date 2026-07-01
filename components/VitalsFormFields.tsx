'use client'

import { useT } from '@/lib/i18n'
import {
  VITALS_FORM_LABEL_CLASS,
  VITALS_FORM_SELECT_CLASS,
  VITALS_VALIDATION_RANGES,
  vitalsInputClass,
  vitalsInputFlexClass,
  type VitalsFormInput,
} from '@/lib/vitals/vitals-form-ui'
import { calculateVitalsBmi } from '@/lib/vitals/save-encounter-vitals'

type Props = {
  form: VitalsFormInput
  onChange: (next: VitalsFormInput) => void
  errors?: Partial<Record<keyof VitalsFormInput | 'temperature' | 'weight' | 'height', string>>
  disabled?: boolean
  savedBmi?: number | null
  clearValueOnUnitChange?: boolean
}

export function VitalsFormFields({
  form,
  onChange,
  errors = {},
  disabled = false,
  savedBmi = null,
  clearValueOnUnitChange = false,
}: Props) {
  const { t } = useT()
  const calculatedBmi = calculateVitalsBmi(form)
  const displayBmi = calculatedBmi ?? (savedBmi != null ? Number(savedBmi) : null)

  const patch = (partial: Partial<VitalsFormInput>) => onChange({ ...form, ...partial })

  const inputCls = (name: keyof typeof errors) => vitalsInputClass(Boolean(errors[name]))
  const inputFlexCls = (name: keyof typeof errors) => vitalsInputFlexClass(Boolean(errors[name]))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={VITALS_FORM_LABEL_CLASS}>{t('vitals.label_bp_systolic')}</label>
          <input
            type="number"
            disabled={disabled}
            min={VITALS_VALIDATION_RANGES.bp_systolic.min}
            max={VITALS_VALIDATION_RANGES.bp_systolic.max}
            value={form.bp_systolic}
            onChange={(e) => patch({ bp_systolic: e.target.value })}
            placeholder={`${VITALS_VALIDATION_RANGES.bp_systolic.min}-${VITALS_VALIDATION_RANGES.bp_systolic.max}`}
            className={inputCls('bp_systolic')}
          />
          {errors.bp_systolic ? <p className="text-red-600 text-xs mt-1">{errors.bp_systolic}</p> : null}
        </div>
        <div>
          <label className={VITALS_FORM_LABEL_CLASS}>{t('vitals.label_bp_diastolic')}</label>
          <input
            type="number"
            disabled={disabled}
            min={VITALS_VALIDATION_RANGES.bp_diastolic.min}
            max={VITALS_VALIDATION_RANGES.bp_diastolic.max}
            value={form.bp_diastolic}
            onChange={(e) => patch({ bp_diastolic: e.target.value })}
            placeholder={`${VITALS_VALIDATION_RANGES.bp_diastolic.min}-${VITALS_VALIDATION_RANGES.bp_diastolic.max}`}
            className={inputCls('bp_diastolic')}
          />
          {errors.bp_diastolic ? <p className="text-red-600 text-xs mt-1">{errors.bp_diastolic}</p> : null}
        </div>

        <div>
          <label className={VITALS_FORM_LABEL_CLASS}>{t('vitals.label_hr')}</label>
          <input
            type="number"
            disabled={disabled}
            min={VITALS_VALIDATION_RANGES.heart_rate.min}
            max={VITALS_VALIDATION_RANGES.heart_rate.max}
            value={form.heart_rate}
            onChange={(e) => patch({ heart_rate: e.target.value })}
            placeholder={`${VITALS_VALIDATION_RANGES.heart_rate.min}-${VITALS_VALIDATION_RANGES.heart_rate.max}`}
            className={inputCls('heart_rate')}
          />
          {errors.heart_rate ? <p className="text-red-600 text-xs mt-1">{errors.heart_rate}</p> : null}
        </div>

        <div>
          <label className={VITALS_FORM_LABEL_CLASS}>{t('vitals.label_rr')}</label>
          <input
            type="number"
            disabled={disabled}
            min={VITALS_VALIDATION_RANGES.respiratory_rate.min}
            max={VITALS_VALIDATION_RANGES.respiratory_rate.max}
            value={form.respiratory_rate}
            onChange={(e) => patch({ respiratory_rate: e.target.value })}
            placeholder="16"
            className={inputCls('respiratory_rate')}
          />
          {errors.respiratory_rate ? <p className="text-red-600 text-xs mt-1">{errors.respiratory_rate}</p> : null}
        </div>

        <div>
          <label className={VITALS_FORM_LABEL_CLASS}>{t('vitals.label_temperature')}</label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.1"
              disabled={disabled}
              min={
                form.temperature_unit === 'F'
                  ? VITALS_VALIDATION_RANGES.temperature_f.min
                  : VITALS_VALIDATION_RANGES.temperature_c.min
              }
              max={
                form.temperature_unit === 'F'
                  ? VITALS_VALIDATION_RANGES.temperature_f.max
                  : VITALS_VALIDATION_RANGES.temperature_c.max
              }
              value={form.temperature}
              onChange={(e) => patch({ temperature: e.target.value })}
              placeholder={
                form.temperature_unit === 'F'
                  ? `${VITALS_VALIDATION_RANGES.temperature_f.min}-${VITALS_VALIDATION_RANGES.temperature_f.max}`
                  : `${VITALS_VALIDATION_RANGES.temperature_c.min}-${VITALS_VALIDATION_RANGES.temperature_c.max}`
              }
              className={inputFlexCls('temperature')}
            />
            <select
              disabled={disabled}
              value={form.temperature_unit}
              onChange={(e) =>
                patch({
                  temperature_unit: e.target.value,
                  ...(clearValueOnUnitChange ? { temperature: '' } : {}),
                })
              }
              className={`${VITALS_FORM_SELECT_CLASS} min-w-[80px]`}
            >
              <option value="F">°F</option>
              <option value="C">°C</option>
            </select>
          </div>
          {errors.temperature ? <p className="text-red-600 text-xs mt-1">{errors.temperature}</p> : null}
        </div>

        <div>
          <label className={VITALS_FORM_LABEL_CLASS}>{t('vitals.label_spo2')}</label>
          <input
            type="number"
            disabled={disabled}
            min={VITALS_VALIDATION_RANGES.spo2.min}
            max={VITALS_VALIDATION_RANGES.spo2.max}
            value={form.spo2}
            onChange={(e) => patch({ spo2: e.target.value })}
            placeholder={`${VITALS_VALIDATION_RANGES.spo2.min}-${VITALS_VALIDATION_RANGES.spo2.max}`}
            className={inputCls('spo2')}
          />
          {errors.spo2 ? <p className="text-red-600 text-xs mt-1">{errors.spo2}</p> : null}
        </div>

        <div>
          <label className={VITALS_FORM_LABEL_CLASS}>{t('vitals.label_weight')}</label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.1"
              disabled={disabled}
              min={
                form.weight_unit === 'lbs'
                  ? VITALS_VALIDATION_RANGES.weight_lbs.min
                  : VITALS_VALIDATION_RANGES.weight_kg.min
              }
              max={
                form.weight_unit === 'lbs'
                  ? VITALS_VALIDATION_RANGES.weight_lbs.max
                  : VITALS_VALIDATION_RANGES.weight_kg.max
              }
              value={form.weight}
              onChange={(e) => patch({ weight: e.target.value })}
              placeholder={
                form.weight_unit === 'lbs'
                  ? `${VITALS_VALIDATION_RANGES.weight_lbs.min}-${VITALS_VALIDATION_RANGES.weight_lbs.max}`
                  : `${VITALS_VALIDATION_RANGES.weight_kg.min}-${VITALS_VALIDATION_RANGES.weight_kg.max}`
              }
              className={inputFlexCls('weight')}
            />
            <select
              disabled={disabled}
              value={form.weight_unit}
              onChange={(e) =>
                patch({
                  weight_unit: e.target.value,
                  ...(clearValueOnUnitChange ? { weight: '' } : {}),
                })
              }
              className={VITALS_FORM_SELECT_CLASS}
            >
              <option value="lbs">lbs</option>
              <option value="kg">kg</option>
            </select>
          </div>
          {errors.weight ? <p className="text-red-600 text-xs mt-1">{errors.weight}</p> : null}
        </div>

        <div>
          <label className={VITALS_FORM_LABEL_CLASS}>{t('vitals.label_height')}</label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.1"
              disabled={disabled}
              min={
                form.height_unit === 'in'
                  ? VITALS_VALIDATION_RANGES.height_in.min
                  : VITALS_VALIDATION_RANGES.height_cm.min
              }
              max={
                form.height_unit === 'in'
                  ? VITALS_VALIDATION_RANGES.height_in.max
                  : VITALS_VALIDATION_RANGES.height_cm.max
              }
              value={form.height}
              onChange={(e) => patch({ height: e.target.value })}
              placeholder={
                form.height_unit === 'in'
                  ? `${VITALS_VALIDATION_RANGES.height_in.min}-${VITALS_VALIDATION_RANGES.height_in.max}`
                  : `${VITALS_VALIDATION_RANGES.height_cm.min}-${VITALS_VALIDATION_RANGES.height_cm.max}`
              }
              className={inputFlexCls('height')}
            />
            <select
              disabled={disabled}
              value={form.height_unit}
              onChange={(e) =>
                patch({
                  height_unit: e.target.value,
                  ...(clearValueOnUnitChange ? { height: '' } : {}),
                })
              }
              className={VITALS_FORM_SELECT_CLASS}
            >
              <option value="in">in</option>
              <option value="cm">cm</option>
            </select>
          </div>
          {errors.height ? <p className="text-red-600 text-xs mt-1">{errors.height}</p> : null}
        </div>

        <div>
          <label className={VITALS_FORM_LABEL_CLASS}>{t('patient_file.bmi')}</label>
          <p className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm">
            {displayBmi != null && Number.isFinite(displayBmi) ? displayBmi.toFixed(1) : t('common.na')}
          </p>
        </div>
      </div>

      <div>
        <label className={VITALS_FORM_LABEL_CLASS}>{t('vitals.label_notes')}</label>
        <textarea
          disabled={disabled}
          value={form.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder={t('vitals.placeholder_notes')}
          rows={3}
          className="w-full px-4 py-2.5 bg-[#f9fbff] border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/35 focus:border-[#2E6EF3] disabled:opacity-50"
        />
      </div>
    </div>
  )
}
