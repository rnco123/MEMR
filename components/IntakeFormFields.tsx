'use client'

import { useT } from '@/lib/i18n'
import { INTAKE_RELIEVING_OPTIONS } from '@/lib/intake/intake-form-mappers'
import { INTAKE_OCCUPATIONS } from '@/lib/intake/occupations'
import type { NurseWalkInIntakeInput } from '@/lib/validation'

const DEFAULT_INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500'
const DEFAULT_SECTION = 'text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3'

type Props = {
  value: NurseWalkInIntakeInput
  onChange: (next: NurseWalkInIntakeInput) => void
  fieldPrefix?: string
  inputClassName?: string
  sectionClassName?: string
  showOptionalHint?: boolean
}

export function IntakeFormFields({
  value,
  onChange,
  fieldPrefix = 'intake',
  inputClassName = DEFAULT_INPUT,
  sectionClassName = DEFAULT_SECTION,
  showOptionalHint = false,
}: Props) {
  const { t } = useT()
  const relievingFactors = value.relieving_factors ?? []

  const patch = (partial: Partial<NurseWalkInIntakeInput>) => {
    onChange({ ...value, ...partial })
  }

  const toggleRelieving = (option: string) => {
    const current = value.relieving_factors ?? []
    const next = current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option]
    patch({ relieving_factors: next })
  }

  return (
    <div className="space-y-6">
      <section>
        <h4 className={sectionClassName}>{t('nurse_walkin.medical_info')}</h4>
        {showOptionalHint ? (
          <p className="text-xs text-slate-500 mb-3">{t('nurse_walkin.optional_hint')}</p>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-slate-600">{t('nurse_walkin.reason')}</label>
            <input
              value={value.chief_complaint ?? ''}
              onChange={(e) => patch({ chief_complaint: e.target.value })}
              className={`${inputClassName} mt-1`}
              placeholder={t('nurse_walkin.reason_ph')}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">{t('nurse_walkin.feeling_since')}</label>
            <input
              type="date"
              value={value.onset ?? ''}
              onChange={(e) => patch({ onset: e.target.value || null })}
              className={`${inputClassName} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">{t('nurse_walkin.symptom_location')}</label>
            <input
              value={value.location ?? ''}
              onChange={(e) => patch({ location: e.target.value })}
              className={`${inputClassName} mt-1`}
              placeholder={t('nurse_walkin.symptom_location_ph')}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">{t('nurse_walkin.severity')}</label>
            <select
              value={value.severity ?? ''}
              onChange={(e) => patch({ severity: e.target.value ? Number(e.target.value) : null })}
              className={`${inputClassName} mt-1`}
            >
              <option value="">{t('nurse_walkin.select')}</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-600">{t('nurse_walkin.symptom_details')}</label>
            <input
              value={value.symptoms_description ?? ''}
              onChange={(e) => patch({ symptoms_description: e.target.value })}
              className={`${inputClassName} mt-1`}
              placeholder={t('nurse_walkin.symptom_details_ph')}
            />
          </div>
          <div className="md:col-span-2">
            <span className="text-xs text-slate-600 block mb-2">{t('nurse_walkin.relieving')}</span>
            <div className="flex flex-wrap gap-2">
              {INTAKE_RELIEVING_OPTIONS.map((opt) => (
                <label key={opt} className="inline-flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={relievingFactors.includes(opt)}
                    onChange={() => toggleRelieving(opt)}
                    className="rounded border-slate-300 text-violet-600"
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-600">{t('nurse_walkin.medications')}</label>
            <input
              value={value.current_medications ?? ''}
              onChange={(e) => patch({ current_medications: e.target.value })}
              className={`${inputClassName} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">{t('nurse_walkin.conditions')}</label>
            <input
              value={value.medical_conditions ?? ''}
              onChange={(e) => patch({ medical_conditions: e.target.value })}
              className={`${inputClassName} mt-1`}
            />
          </div>
        </div>
      </section>

      <section>
        <h4 className={sectionClassName}>{t('nurse_walkin.medical_history')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-slate-600">{t('nurse_walkin.surgeries')}</span>
            <div className="flex gap-4 mt-2">
              {(['yes', 'no'] as const).map((v) => (
                <label key={v} className="inline-flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name={`${fieldPrefix}-surgeries`}
                    checked={value.surgeries === v}
                    onChange={() => patch({ surgeries: v })}
                  />
                  {v === 'yes' ? t('common.yes') : t('common.no')}
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-slate-600">{t('nurse_walkin.allergies')}</span>
            <div className="flex gap-4 mt-2">
              {(['yes', 'no'] as const).map((v) => (
                <label key={v} className="inline-flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name={`${fieldPrefix}-allergies`}
                    checked={value.allergies === v}
                    onChange={() => patch({ allergies: v })}
                  />
                  {v === 'yes' ? t('common.yes') : t('common.no')}
                </label>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <span className="text-xs text-slate-600 block mb-2">{t('nurse_walkin.family_history')}</span>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ['fh_hypertension', 'nurse_walkin.fh_hypertension', value.fh_hypertension],
                  ['fh_diabetes', 'nurse_walkin.fh_diabetes', value.fh_diabetes],
                  ['fh_cancer', 'nurse_walkin.fh_cancer', value.fh_cancer],
                  ['fh_heart_disease', 'nurse_walkin.fh_heart', value.fh_heart_disease],
                ] as const
              ).map(([key, labelKey, checked]) => (
                <label key={key} className="inline-flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(checked)}
                    onChange={(e) => patch({ [key]: e.target.checked } as Partial<NurseWalkInIntakeInput>)}
                    className="rounded border-slate-300 text-violet-600"
                  />
                  {t(labelKey)}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h4 className={sectionClassName}>{t('nurse_walkin.social_history')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-600">{t('nurse_walkin.occupation')}</label>
            <select
              value={value.occupation ?? ''}
              onChange={(e) => patch({ occupation: e.target.value ? Number(e.target.value) : null })}
              className={`${inputClassName} mt-1`}
            >
              <option value="">{t('nurse_walkin.select')}</option>
              {INTAKE_OCCUPATIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-xs text-slate-600 block mb-2">{t('nurse_walkin.lifestyle')}</span>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ['tobacco_use', 'nurse_walkin.tobacco', value.tobacco_use],
                  ['alcohol_use', 'nurse_walkin.alcohol', value.alcohol_use],
                  ['drug_use', 'nurse_walkin.drug', value.drug_use],
                ] as const
              ).map(([key, labelKey, checked]) => (
                <label key={key} className="inline-flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(checked)}
                    onChange={(e) => patch({ [key]: e.target.checked } as Partial<NurseWalkInIntakeInput>)}
                    className="rounded border-slate-300 text-violet-600"
                  />
                  {t(labelKey)}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
