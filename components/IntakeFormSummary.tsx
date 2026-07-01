'use client'

import { useMemo } from 'react'
import { useT } from '@/lib/i18n'
import {
  formatIntakeJsonList,
  formatIntakeOccupation,
  formatIntakeYesNo,
} from '@/lib/intake/intake-form-display'

const DEFAULT_SECTION = 'text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3'

type Props = {
  intake: Record<string, unknown>
  sectionClassName?: string
}

export function IntakeFormSummary({ intake, sectionClassName = DEFAULT_SECTION }: Props) {
  const { t } = useT()

  const summary = useMemo(() => {
    const familyHistory = [
      intake.fh_hypertension ? t('nurse_walkin.fh_hypertension') : null,
      intake.fh_diabetes ? t('nurse_walkin.fh_diabetes') : null,
      intake.fh_cancer ? t('nurse_walkin.fh_cancer') : null,
      intake.fh_heart_disease ? t('nurse_walkin.fh_heart') : null,
    ].filter(Boolean)

    const lifestyle = [
      intake.tobacco_use ? t('nurse_walkin.tobacco') : null,
      intake.alcohol_use ? t('nurse_walkin.alcohol') : null,
      intake.drug_use ? t('nurse_walkin.drug') : null,
    ].filter(Boolean)

    const occupation = formatIntakeOccupation(intake.occupation)

    return { familyHistory, lifestyle, occupation }
  }, [intake, t])

  return (
    <div className="space-y-6">
      <section>
        <h4 className={sectionClassName}>{t('nurse_walkin.medical_info')}</h4>
        <div className="space-y-3">
          <div>
            <p className="text-slate-500 text-sm mb-1">{t('nurse_walkin.reason')}</p>
            <p className="text-slate-900">{String(intake.chief_complaint ?? t('common.na'))}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {intake.onset ? (
              <div>
                <p className="text-slate-500 text-sm mb-1">{t('nurse_walkin.feeling_since')}</p>
                <p className="text-slate-900">{String(intake.onset).slice(0, 10)}</p>
              </div>
            ) : null}
            {intake.location ? (
              <div>
                <p className="text-slate-500 text-sm mb-1">{t('nurse_walkin.symptom_location')}</p>
                <p className="text-slate-900">{String(intake.location)}</p>
              </div>
            ) : null}
            {intake.severity != null ? (
              <div>
                <p className="text-slate-500 text-sm mb-1">{t('nurse_walkin.severity')}</p>
                <p className="text-slate-900">{String(intake.severity)}/10</p>
              </div>
            ) : null}
          </div>
          {intake.symptoms_description ? (
            <div>
              <p className="text-slate-500 text-sm mb-1">{t('nurse_walkin.symptom_details')}</p>
              <p className="text-slate-900">{String(intake.symptoms_description)}</p>
            </div>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {intake.current_medications ? (
              <div>
                <p className="text-slate-500 text-sm mb-1">{t('nurse_walkin.medications')}</p>
                <p className="text-slate-900 text-sm">
                  {formatIntakeJsonList(intake.current_medications) || t('common.na')}
                </p>
              </div>
            ) : null}
            {intake.medical_conditions ? (
              <div>
                <p className="text-slate-500 text-sm mb-1">{t('nurse_walkin.conditions')}</p>
                <p className="text-slate-900 text-sm">
                  {formatIntakeJsonList(intake.medical_conditions) || t('common.na')}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section>
        <h4 className={sectionClassName}>{t('nurse_walkin.medical_history')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {intake.surgeries ? (
            <div>
              <p className="text-slate-500 text-sm mb-1">{t('nurse_walkin.surgeries')}</p>
              <p className="text-slate-900 text-sm">{formatIntakeYesNo(intake.surgeries) || t('common.na')}</p>
            </div>
          ) : null}
          {intake.allergies ? (
            <div>
              <p className="text-slate-500 text-sm mb-1">{t('nurse_walkin.allergies')}</p>
              <p className="text-slate-900 text-sm">{formatIntakeYesNo(intake.allergies) || t('common.na')}</p>
            </div>
          ) : null}
          {summary.familyHistory.length > 0 ? (
            <div className="md:col-span-2">
              <p className="text-slate-500 text-sm mb-1">{t('nurse_walkin.family_history')}</p>
              <p className="text-slate-900 text-sm">{summary.familyHistory.join(', ')}</p>
            </div>
          ) : null}
        </div>
      </section>

      {(summary.occupation || summary.lifestyle.length > 0) && (
        <section>
          <h4 className={sectionClassName}>{t('nurse_walkin.social_history')}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summary.occupation ? (
              <div>
                <p className="text-slate-500 text-sm mb-1">{t('nurse_walkin.occupation')}</p>
                <p className="text-slate-900 text-sm">{summary.occupation}</p>
              </div>
            ) : null}
            {summary.lifestyle.length > 0 ? (
              <div>
                <p className="text-slate-500 text-sm mb-1">{t('nurse_walkin.lifestyle')}</p>
                <p className="text-slate-900 text-sm">{summary.lifestyle.join(', ')}</p>
              </div>
            ) : null}
          </div>
        </section>
      )}
    </div>
  )
}
