'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { isForbiddenResponse } from '@/lib/http/api-response'
import { encounterSectionAuditFromRow } from '@/lib/encounter/encounter-section-audit'
import {
  calculateVitalsBmi,
  vitalsRowToFormInput,
  type EncounterVitalsRow,
} from '@/lib/vitals/save-encounter-vitals'
import { EncounterSectionAuditLine } from '@/components/EncounterSectionAuditLine'
import { EncounterSectionEditButton } from '@/components/EncounterSectionEditButton'
import { VitalsFormFields } from '@/components/VitalsFormFields'
import {
  validateVitalsForm,
  type VitalsFormInput,
} from '@/lib/vitals/vitals-form-ui'

type VitalsRecord = Record<string, unknown> & Partial<EncounterVitalsRow>

type Props = {
  encounterId: number
  vitals: VitalsRecord | null
  canEdit: boolean
  onUpdated: () => void | Promise<void>
}


function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ''
}

function formatVitalValue(
  vitals: VitalsRecord,
  t: (key: string) => string
): ReactNode {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div>
        <p className="text-slate-500 text-sm mb-1">{t('patient_file.bp')}</p>
        <p className="text-slate-900 font-semibold">
          {vitals.bp_systolic && vitals.bp_diastolic
            ? `${vitals.bp_systolic}/${vitals.bp_diastolic} mmHg`
            : t('common.na')}
        </p>
      </div>
      <div>
        <p className="text-slate-500 text-sm mb-1">{t('patient_file.hr')}</p>
        <p className="text-slate-900 font-semibold">
          {vitals.heart_rate ? `${vitals.heart_rate} bpm` : t('common.na')}
        </p>
      </div>
      <div>
        <p className="text-slate-500 text-sm mb-1">{t('patient_file.temp')}</p>
        <p className="text-slate-900 font-semibold">
          {hasValue(vitals.temperature)
            ? `${vitals.temperature}°${vitals.temperature_unit || 'F'}`
            : t('common.na')}
        </p>
      </div>
      <div>
        <p className="text-slate-500 text-sm mb-1">{t('patient_file.spo2')}</p>
        <p className="text-slate-900 font-semibold">
          {vitals.spo2 ? `${vitals.spo2}%` : t('common.na')}
        </p>
      </div>
      <div>
        <p className="text-slate-500 text-sm mb-1">{t('patient_file.rr')}</p>
        <p className="text-slate-900 font-semibold">
          {vitals.respiratory_rate ? `${vitals.respiratory_rate} /min` : t('common.na')}
        </p>
      </div>
      <div>
        <p className="text-slate-500 text-sm mb-1">{t('patient_file.weight')}</p>
        <p className="text-slate-900 font-semibold">
          {hasValue(vitals.weight) ? `${vitals.weight} ${vitals.weight_unit || 'lbs'}` : t('common.na')}
        </p>
      </div>
      <div>
        <p className="text-slate-500 text-sm mb-1">{t('patient_file.height')}</p>
        <p className="text-slate-900 font-semibold">
          {hasValue(vitals.height) ? `${vitals.height} ${vitals.height_unit || 'in'}` : t('common.na')}
        </p>
      </div>
      <div>
        <p className="text-slate-500 text-sm mb-1">{t('patient_file.bmi')}</p>
        <p className="text-slate-900 font-semibold">
          {vitals.bmi != null ? Number(vitals.bmi).toFixed(1) : t('common.na')}
        </p>
      </div>
      {vitals.notes ? (
        <div className="col-span-full">
          <p className="text-slate-500 text-sm mb-1">{t('common.notes')}</p>
          <p className="text-slate-900">{String(vitals.notes)}</p>
        </div>
      ) : null}
    </div>
  )
}

export function EncounterVitalsPanel({ encounterId, vitals, canEdit, onUpdated }: Props) {
  const { t } = useT()
  const [isCreating, setIsCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<VitalsFormInput>(vitalsRowToFormInput(null))

  const hasVitals = vitals != null
  const showForm = canEdit && (isCreating || isEditing)
  const audit = useMemo(() => encounterSectionAuditFromRow(vitals), [vitals])

  useEffect(() => {
    setIsCreating(false)
    setIsEditing(false)
    setErrors({})
    setForm(vitalsRowToFormInput(vitals as EncounterVitalsRow | null))
  }, [encounterId, vitals])

  const handleFormChange = (next: VitalsFormInput) => {
    setForm(next)
    setErrors(validateVitalsForm(next))
  }

  const resetForm = () => {
    setErrors({})
    setForm(vitalsRowToFormInput(vitals as EncounterVitalsRow | null))
  }

  const cancelEdit = () => {
    setIsCreating(false)
    setIsEditing(false)
    resetForm()
  }

  const saveVitals = async () => {
    const validationErrors = validateVitalsForm(form)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setSaving(true)
    try {
      const bmi =
        calculateVitalsBmi(form) ??
        (vitals?.bmi != null && Number.isFinite(Number(vitals.bmi)) ? Number(vitals.bmi) : null)
      const res = await fetch(`/api/encounters/${encounterId}/vitals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bp_systolic: form.bp_systolic ? parseInt(form.bp_systolic, 10) : null,
          bp_diastolic: form.bp_diastolic ? parseInt(form.bp_diastolic, 10) : null,
          heart_rate: form.heart_rate ? parseInt(form.heart_rate, 10) : null,
          respiratory_rate: form.respiratory_rate ? parseInt(form.respiratory_rate, 10) : null,
          temperature: form.temperature ? parseFloat(form.temperature) : null,
          temperature_unit: form.temperature_unit,
          spo2: form.spo2 ? parseInt(form.spo2, 10) : null,
          weight: form.weight ? parseFloat(form.weight) : null,
          weight_unit: form.weight_unit,
          height: form.height ? parseFloat(form.height) : null,
          height_unit: form.height_unit,
          bmi,
          notes: form.notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) return
        throw new Error(json.error || t('encounter_modal.toast_save_failed'))
      }
      toast.success(t('encounter_modal.toast_saved'))
      setIsCreating(false)
      setIsEditing(false)
      await onUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.toast_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit && !hasVitals) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {t('patient_file.vitals')}
          </h3>
        </div>
        <p className="text-slate-600">{t('encounter_modal.vitals_not_recorded')}</p>
      </div>
    )
  }

  const headerAction =
    canEdit && !showForm ? (
      hasVitals ? (
        <EncounterSectionEditButton onClick={() => setIsEditing(true)} />
      ) : (
        <EncounterSectionEditButton
          onClick={() => setIsCreating(true)}
          label={t('encounter_modal.vitals_start')}
        />
      )
    ) : null

  const previewBmi = vitals?.bmi != null ? Number(vitals.bmi) : null

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {t('patient_file.vitals')}
          </h3>
          {audit ? <EncounterSectionAuditLine audit={audit} /> : null}
          {!showForm && !hasVitals && canEdit ? (
            <p className="text-xs text-slate-500 mt-1">{t('encounter_modal.vitals_start_hint')}</p>
          ) : null}
        </div>
        {headerAction}
      </div>

      {!showForm && hasVitals ? formatVitalValue(vitals, t) : null}

      {showForm ? (
        <div className="space-y-4">
          <VitalsFormFields
            form={form}
            onChange={handleFormChange}
            errors={errors}
            disabled={saving}
            savedBmi={previewBmi}
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={cancelEdit}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveVitals()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('encounter_modal.vitals_save')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
