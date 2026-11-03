'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { EncounterSectionEditButton } from '@/components/EncounterSectionEditButton'
import { ImmigrationScreeningFields } from '@/components/ImmigrationScreeningFields'
import { countryDisplayLabel } from '@/components/CountrySelect'
import {
  applyNurseScreeningToI693Form,
  extractNurseScreeningFromForm,
  NURSE_VACCINE_ROWS,
  SCREENING_QUESTION_KEYS,
  type NurseImmigrationScreening,
} from '@/lib/i693/nurse-screening'
import type { I693FormData } from '@/lib/i693/types'

type Props = {
  encounterId: number
  canEdit: boolean
  patientGender: string | null | undefined
  patientAge: number | null | undefined
}

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-slate-50 disabled:text-slate-500'
const SECTION = 'text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3'

/**
 * Immigration (Form A) intake for the encounter modal — replaces the general
 * intake panel on immigration encounters. Reads and writes the structured
 * screening answers stored in the patient's I-693 form data, so the walk-in
 * modal, this panel, and the I-693 PDF editor all share one source of truth.
 */
export function EncounterImmigrationIntakePanel({
  encounterId,
  canEdit,
  patientGender,
  patientAge,
}: Props) {
  const { t, language } = useT()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [screening, setScreening] = useState<NurseImmigrationScreening | null>(null)
  const [draft, setDraft] = useState<NurseImmigrationScreening | null>(null)

  // Booking-app rule: Female matched on the first letter (Female / Femenino) and age > 15.
  const showWomensHealth =
    (patientGender ?? '').trim().toLowerCase().startsWith('f') && (patientAge ?? 0) > 15

  const loadScreening = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/i693`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      const formData = (json?.submission?.form_data ?? null) as Partial<I693FormData> | null
      setScreening(extractNurseScreeningFromForm(formData))
    } catch {
      setScreening(extractNurseScreeningFromForm(null))
    } finally {
      setLoading(false)
    }
  }, [encounterId])

  useEffect(() => {
    setIsEditing(false)
    setDraft(null)
    void loadScreening()
  }, [loadScreening])

  const saveDraft = async () => {
    if (!draft) return
    setSaving(true)
    try {
      // Merge onto the freshest stored form so concurrent I-693 edits survive.
      const getRes = await fetch(`/api/encounters/${encounterId}/i693`, { credentials: 'include' })
      const getJson = await getRes.json().catch(() => ({}))
      const existing = (getJson?.submission?.form_data ?? null) as Partial<I693FormData> | null
      const merged = applyNurseScreeningToI693Form(existing, draft)
      const putRes = await fetch(`/api/encounters/${encounterId}/i693`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_data: merged, status: 'draft' }),
      })
      const putJson = await putRes.json().catch(() => ({}))
      if (!putRes.ok) throw new Error(putJson.error || t('encounter_modal.toast_save_failed'))
      setScreening(draft)
      setIsEditing(false)
      setDraft(null)
      toast.success(t('imm_intake.saved_to_i693'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.toast_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const answered = (v: string) =>
    v === 'yes' ? t('common.yes') : v === 'no' ? t('common.no') : v === 'unsure' ? t('imm_intake.unsure') : '—'

  const hasAnyAnswer =
    screening != null &&
    (SCREENING_QUESTION_KEYS.some((k) => screening[k] !== '') ||
      screening.pregnant !== '' ||
      screening.has_allergies !== '' ||
      screening.vaccinations.some((r) => r.haveRecord !== '' || r.notSure) ||
      screening.country_of_birth.trim() !== '' ||
      screening.a_number.trim() !== '')

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          {t('imm_intake.panel_title')}
        </h3>
        {canEdit && !isEditing && !loading && screening && (
          <EncounterSectionEditButton
            onClick={() => {
              setDraft(screening)
              setIsEditing(true)
            }}
            label={hasAnyAnswer ? undefined : t('encounter_modal.intake_start')}
          />
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : isEditing && draft ? (
        <div className="space-y-5">
          <ImmigrationScreeningFields
            value={draft}
            onChange={setDraft}
            showWomensHealth={showWomensHealth}
            fieldPrefix={`encounter-imm-${encounterId}`}
            inputClassName={INPUT}
            sectionClassName={SECTION}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setIsEditing(false)
                setDraft(null)
              }}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveDraft()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('encounter_modal.intake_save')}
            </button>
          </div>
        </div>
      ) : !screening || !hasAnyAnswer ? (
        <p className="text-slate-600 text-sm">{t('encounter_modal.intake_not_available')}</p>
      ) : (
        <div className="space-y-5">
          <section>
            <h4 className={SECTION}>{t('imm_intake.section_identity')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <p>
                <span className="text-slate-500">{t('imm_intake.country_of_birth')}: </span>
                <span className="font-medium text-slate-900">
                  {countryDisplayLabel(screening.country_of_birth, language) || '—'}
                </span>
              </p>
              <p>
                <span className="text-slate-500">{t('imm_intake.country_of_citizenship')}: </span>
                <span className="font-medium text-slate-900">
                  {countryDisplayLabel(screening.country_of_citizenship, language) || '—'}
                </span>
              </p>
              <p>
                <span className="text-slate-500">{t('imm_intake.passport_number')}: </span>
                <span className="font-medium text-slate-900">{screening.passport_number || '—'}</span>
              </p>
              <p>
                <span className="text-slate-500">{t('imm_intake.a_number')}: </span>
                <span className="font-medium text-slate-900">{screening.a_number || '—'}</span>
              </p>
            </div>
          </section>

          <section>
            <h4 className={SECTION}>{t('imm_intake.section_screening')}</h4>
            <div className="space-y-1 text-sm">
              {SCREENING_QUESTION_KEYS.slice(0, 6).map((key) => (
                <p key={key} className="flex justify-between gap-4 py-0.5">
                  <span className="text-slate-600">{t(`imm_intake.q_${key}`)}</span>
                  <span className="font-semibold text-slate-900 shrink-0">{answered(screening[key])}</span>
                </p>
              ))}
            </div>
          </section>

          <section>
            <h4 className={SECTION}>{t('imm_intake.section_mental')}</h4>
            <div className="space-y-1 text-sm">
              {SCREENING_QUESTION_KEYS.slice(6).map((key) => (
                <p key={key} className="flex justify-between gap-4 py-0.5">
                  <span className="text-slate-600">{t(`imm_intake.q_${key}`)}</span>
                  <span className="font-semibold text-slate-900 shrink-0">{answered(screening[key])}</span>
                </p>
              ))}
            </div>
          </section>

          <section>
            <h4 className={SECTION}>{t('imm_intake.section_vaccinations')}</h4>
            <div className="space-y-1 text-sm">
              {NURSE_VACCINE_ROWS.map((v) => {
                const row = screening.vaccinations.find((r) => r.key === v.key)
                if (!row) return null
                const status = row.notSure
                  ? t('imm_intake.vacc_not_sure')
                  : row.haveRecord
                    ? `${answered(row.haveRecord)}${row.dates ? ` · ${row.dates}` : ''}`
                    : '—'
                return (
                  <p key={v.key} className="flex justify-between gap-4 py-0.5">
                    <span className="text-slate-600">{v.label}</span>
                    <span className="font-medium text-slate-900 shrink-0">{status}</span>
                  </p>
                )
              })}
            </div>
          </section>

          <section>
            <h4 className={SECTION}>{t('imm_intake.section_allergies')}</h4>
            <p className="text-sm">
              <span className="font-medium text-slate-900">
                {screening.has_allergies === 'no'
                  ? t('imm_intake.no_known_allergies')
                  : screening.has_allergies === 'yes'
                    ? screening.allergies || t('common.yes')
                    : '—'}
              </span>
            </p>
          </section>

          {showWomensHealth && (
            <section>
              <h4 className={SECTION}>{t('imm_intake.section_womens')}</h4>
              <div className="space-y-1 text-sm">
                <p className="flex justify-between gap-4 py-0.5">
                  <span className="text-slate-600">{t('imm_intake.q_pregnant')}</span>
                  <span className="font-semibold text-slate-900 shrink-0">{answered(screening.pregnant)}</span>
                </p>
                {screening.pregnancy_weeks && (
                  <p className="flex justify-between gap-4 py-0.5">
                    <span className="text-slate-600">{t('imm_intake.pregnancy_weeks')}</span>
                    <span className="font-medium text-slate-900 shrink-0">{screening.pregnancy_weeks}</span>
                  </p>
                )}
                {screening.last_menstrual_period && (
                  <p className="flex justify-between gap-4 py-0.5">
                    <span className="text-slate-600">{t('imm_intake.lmp')}</span>
                    <span className="font-medium text-slate-900 shrink-0">{screening.last_menstrual_period}</span>
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
