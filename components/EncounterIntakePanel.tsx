'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { isForbiddenResponse } from '@/lib/http/api-response'
import {
  emptyIntakeFormInput,
  intakeRowToFormInput,
} from '@/lib/intake/intake-form-mappers'
import { encounterSectionAuditFromRow } from '@/lib/encounter/encounter-section-audit'
import { EncounterSectionAuditLine } from '@/components/EncounterSectionAuditLine'
import { EncounterSectionEditButton } from '@/components/EncounterSectionEditButton'
import { IntakeFormFields } from '@/components/IntakeFormFields'
import { IntakeFormSummary } from '@/components/IntakeFormSummary'
import type { NurseWalkInIntakeInput } from '@/lib/validation'

type IntakeRecord = Record<string, unknown> & { id?: number }

type Props = {
  encounterId: number
  intake: IntakeRecord | null
  canEdit: boolean
  onUpdated: () => void | Promise<void>
}

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-slate-50 disabled:text-slate-500'

export function EncounterIntakePanel({ encounterId, intake, canEdit, onUpdated }: Props) {
  const { t } = useT()
  const [isCreating, setIsCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<NurseWalkInIntakeInput>({})
  const [prefillLoaded, setPrefillLoaded] = useState(false)

  const hasIntake = intake != null
  const showForm = canEdit && (isCreating || isEditing)
  const audit = useMemo(() => encounterSectionAuditFromRow(intake), [intake])

  useEffect(() => {
    setIsCreating(false)
    setIsEditing(false)
    setPrefillLoaded(false)
    setForm(intake ? intakeRowToFormInput(intake) : emptyIntakeFormInput())
  }, [encounterId, intake])

  useEffect(() => {
    if (!isCreating || hasIntake || prefillLoaded) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/encounters/${encounterId}/intake`, { credentials: 'include' })
        const json = await res.json().catch(() => ({}))
        if (cancelled || !res.ok || !json.prefill) return
        setForm((prev) => (Object.keys(prev).length > 0 ? prev : (json.prefill as NurseWalkInIntakeInput)))
      } finally {
        if (!cancelled) setPrefillLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [encounterId, hasIntake, isCreating, prefillLoaded])

  const resetForm = () => {
    setForm(intake ? intakeRowToFormInput(intake) : emptyIntakeFormInput())
    setPrefillLoaded(false)
  }

  const cancelEdit = () => {
    setIsCreating(false)
    setIsEditing(false)
    resetForm()
  }

  const saveIntake = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/intake`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
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

  if (!canEdit && !hasIntake) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('encounter_modal.intake_form')}
          </h3>
        </div>
        <p className="text-slate-600">{t('encounter_modal.intake_not_available')}</p>
      </div>
    )
  }

  const headerAction =
    canEdit && !showForm ? (
      hasIntake ? (
        <EncounterSectionEditButton onClick={() => setIsEditing(true)} />
      ) : (
        <EncounterSectionEditButton
          onClick={() => setIsCreating(true)}
          label={t('encounter_modal.intake_start')}
        />
      )
    ) : null

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('encounter_modal.intake_form')}
          </h3>
          {audit ? <EncounterSectionAuditLine audit={audit} /> : null}
          {!showForm && !hasIntake && canEdit ? (
            <p className="text-xs text-slate-500 mt-1">{t('encounter_modal.intake_start_hint')}</p>
          ) : null}
        </div>
        {headerAction}
      </div>

      {!showForm && hasIntake && intake ? <IntakeFormSummary intake={intake} /> : null}

      {showForm ? (
        <div className="space-y-5">
          <IntakeFormFields
            value={form}
            onChange={setForm}
            fieldPrefix={`encounter-${encounterId}`}
            inputClassName={INPUT}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
              onClick={() => void saveIntake()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('encounter_modal.intake_save')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
