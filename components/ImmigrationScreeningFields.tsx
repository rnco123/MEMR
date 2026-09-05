'use client'

import { useT } from '@/lib/i18n'
import { CountrySelect } from '@/components/CountrySelect'
import {
  NURSE_VACCINE_ROWS,
  SCREENING_QUESTION_KEYS,
  type NurseImmigrationScreening,
  type YesNo,
} from '@/lib/i693/nurse-screening'

type Props = {
  value: NurseImmigrationScreening
  onChange: (next: NurseImmigrationScreening) => void
  showWomensHealth: boolean
  /** Unique prefix so radio-group names don't collide across mounted forms. */
  fieldPrefix: string
  inputClassName: string
  sectionClassName: string
  disabled?: boolean
}

/** Form A clinical sections (screening, mental health, vaccinations, women's health, identity). */
export function ImmigrationScreeningFields({
  value,
  onChange,
  showWomensHealth,
  fieldPrefix,
  inputClassName,
  sectionClassName,
  disabled = false,
}: Props) {
  const { t } = useT()

  const setAnswer = (key: (typeof SCREENING_QUESTION_KEYS)[number], v: YesNo) => {
    onChange({ ...value, [key]: v })
  }

  const setVaccinationRow = (
    key: string,
    patch: Partial<NurseImmigrationScreening['vaccinations'][number]>
  ) => {
    onChange({
      ...value,
      vaccinations: value.vaccinations.map((row) =>
        row.key === key
          ? {
              ...row,
              ...patch,
              // "Not sure" clears and disables the row's answer and dates.
              ...(patch.notSure ? { haveRecord: '' as YesNo, dates: '' } : {}),
            }
          : row
      ),
    })
  }

  const renderYesNo = (key: (typeof SCREENING_QUESTION_KEYS)[number]) => (
    <div key={key} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-50">
      <span className="text-sm text-slate-800 flex-1 min-w-[240px]">{t(`imm_intake.q_${key}`)}</span>
      <div className="flex items-center gap-4 text-sm shrink-0">
        {(['yes', 'no'] as const).map((v) => (
          <label key={v} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name={`${fieldPrefix}-${key}`}
              checked={value[key] === v}
              disabled={disabled}
              onChange={() => setAnswer(key, v)}
            />
            {v === 'yes' ? t('common.yes') : t('common.no')}
          </label>
        ))}
      </div>
    </div>
  )

  return (
    <>
      <section>
        <h3 className={sectionClassName}>{t('imm_intake.section_identity')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-600">{t('imm_intake.country_of_birth')}</label>
            <CountrySelect
              value={value.country_of_birth}
              disabled={disabled}
              onChange={(code) => onChange({ ...value, country_of_birth: code })}
              className={`${inputClassName} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">{t('imm_intake.country_of_citizenship')}</label>
            <CountrySelect
              value={value.country_of_citizenship}
              disabled={disabled}
              onChange={(code) => onChange({ ...value, country_of_citizenship: code })}
              className={`${inputClassName} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">{t('imm_intake.passport_number')}</label>
            <input
              value={value.passport_number}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, passport_number: e.target.value })}
              className={`${inputClassName} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">{t('imm_intake.a_number')}</label>
            <input
              value={value.a_number}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, a_number: e.target.value })}
              placeholder="A-"
              className={`${inputClassName} mt-1`}
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className={sectionClassName}>{t('imm_intake.section_screening')} *</h3>
        {SCREENING_QUESTION_KEYS.slice(0, 6).map(renderYesNo)}
      </section>

      <section>
        <h3 className={sectionClassName}>{t('imm_intake.section_mental')} *</h3>
        {SCREENING_QUESTION_KEYS.slice(6).map(renderYesNo)}
      </section>

      <section>
        <h3 className={sectionClassName}>{t('imm_intake.section_vaccinations')}</h3>
        <div className="space-y-1">
          {NURSE_VACCINE_ROWS.map((v) => {
            const row = value.vaccinations.find((r) => r.key === v.key)
            if (!row) return null
            return (
              <div key={v.key} className="flex flex-wrap items-center gap-3 py-1.5 border-b border-slate-50">
                <span className="w-36 text-sm text-slate-800 shrink-0">{v.label}</span>
                <div className="flex items-center gap-3 text-sm shrink-0">
                  {(['yes', 'no'] as const).map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`${fieldPrefix}-vacc-${v.key}`}
                        checked={row.haveRecord === opt}
                        disabled={disabled || row.notSure}
                        onChange={() => setVaccinationRow(v.key, { haveRecord: opt })}
                      />
                      {opt === 'yes' ? t('common.yes') : t('common.no')}
                    </label>
                  ))}
                </div>
                <input
                  value={row.dates}
                  onChange={(e) => setVaccinationRow(v.key, { dates: e.target.value })}
                  placeholder={t('imm_intake.vacc_dates')}
                  disabled={disabled || row.notSure}
                  className={`${inputClassName} flex-1 min-w-[140px] disabled:bg-slate-50 disabled:text-slate-400`}
                />
                <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={row.notSure}
                    disabled={disabled}
                    onChange={(e) => setVaccinationRow(v.key, { notSure: e.target.checked })}
                  />
                  {t('imm_intake.vacc_not_sure')}
                </label>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('imm_intake.vacc_note')}</p>
      </section>

      <section>
        <h3 className={sectionClassName}>{t('imm_intake.section_allergies')} *</h3>
        <div className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="text-sm text-slate-800 flex-1 min-w-[240px]">{t('imm_intake.q_has_allergies')}</span>
          <div className="flex items-center gap-4 text-sm shrink-0">
            {(['yes', 'no'] as const).map((v) => (
              <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`${fieldPrefix}-has-allergies`}
                  checked={value.has_allergies === v}
                  disabled={disabled}
                  onChange={() =>
                    onChange({ ...value, has_allergies: v, ...(v === 'no' ? { allergies: '' } : {}) })
                  }
                />
                {v === 'yes' ? t('common.yes') : t('common.no')}
              </label>
            ))}
          </div>
        </div>
        {value.has_allergies === 'yes' && (
          <input
            value={value.allergies}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, allergies: e.target.value })}
            placeholder={t('imm_intake.allergies_ph')}
            className={`${inputClassName} mt-1`}
          />
        )}
      </section>

      {showWomensHealth && (
        <section>
          <h3 className={sectionClassName}>{t('imm_intake.section_womens')}</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('imm_intake.q_pregnant')} *</label>
              <div className="mt-1 flex items-center gap-4 text-sm">
                {(['yes', 'no', 'unsure'] as const).map((v) => (
                  <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`${fieldPrefix}-pregnant`}
                      checked={value.pregnant === v}
                      disabled={disabled}
                      onChange={() => onChange({ ...value, pregnant: v })}
                    />
                    {v === 'yes' ? t('common.yes') : v === 'no' ? t('common.no') : t('imm_intake.unsure')}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-600">{t('imm_intake.pregnancy_weeks')}</label>
                <input
                  value={value.pregnancy_weeks}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...value, pregnancy_weeks: e.target.value })}
                  className={`${inputClassName} mt-1`}
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">{t('imm_intake.lmp')}</label>
                <input
                  value={value.last_menstrual_period}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...value, last_menstrual_period: e.target.value })}
                  className={`${inputClassName} mt-1`}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">{t('imm_intake.womens_note')}</p>
          </div>
        </section>
      )}
    </>
  )
}
