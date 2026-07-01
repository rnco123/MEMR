'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { isForbiddenResponse } from '@/lib/http/api-response'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EncounterSectionEditButton } from '@/components/EncounterSectionEditButton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { cleanSoapSection } from '@/lib/soap/clean-soap-section'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'

type SoapFields = {
  subjective_text: string
  objective_text: string
  assessment_text: string
  plan_text: string
}

type AiSoap = {
  id?: number
  created_at?: string
  updated_at?: string
  subjective_text?: string | null
  objective_text?: string | null
  assessment_text?: string | null
  plan_text?: string | null
}

type DoctorSoap = SoapFields & {
  id: number
  created_at: string
  updated_at: string
}

type SoapAudit = {
  editor_name: string | null
  editor_role: string | null
  action: 'create' | 'update'
  source: 'ai_seed' | 'doctor_soap' | 'manual'
  created_at: string
}

const blankForm: SoapFields = {
  subjective_text: '',
  objective_text: '',
  assessment_text: '',
  plan_text: '',
}

type Props = {
  encounterId: number
  aiSoap: AiSoap | null
  canEdit: boolean
  encounterStatus?: string | null
  onDownloadDoctorPdf?: (soap: SoapFields) => void
}

function soapFromAi(ai: AiSoap | null): SoapFields {
  if (!ai) return { ...blankForm }
  return {
    subjective_text: cleanSoapSection(ai.subjective_text, 'subjective'),
    objective_text: cleanSoapSection(ai.objective_text, 'objective'),
    assessment_text: cleanSoapSection(ai.assessment_text, 'assessment'),
    plan_text: cleanSoapSection(ai.plan_text, 'plan'),
  }
}

function soapFromDoctor(doc: DoctorSoap | null): SoapFields {
  if (!doc) return { ...blankForm }
  return {
    subjective_text: doc.subjective_text?.trim() ?? '',
    objective_text: doc.objective_text?.trim() ?? '',
    assessment_text: doc.assessment_text?.trim() ?? '',
    plan_text: doc.plan_text?.trim() ?? '',
  }
}

export function EncounterSoapPanel({
  encounterId,
  aiSoap,
  canEdit,
  encounterStatus = null,
  onDownloadDoctorPdf,
}: Props) {
  const { t, language } = useT()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [doctorSoap, setDoctorSoap] = useState<DoctorSoap | null>(null)
  const [lastAudit, setLastAudit] = useState<SoapAudit | null>(null)
  const [editable, setEditable] = useState(canEdit)
  const [form, setForm] = useState<SoapFields>(blankForm)
  const [seededFromAi, setSeededFromAi] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  const loadDoctorSoap = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/doctor-soap`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) {
          setEditable(false)
          return
        }
        throw new Error(json.error || t('encounter_modal.soap_load_failed'))
      }

      const doc = (json.doctor_soap as DoctorSoap | null) ?? null
      setDoctorSoap(doc)
      setLastAudit((json.last_audit as SoapAudit | null) ?? null)
      setEditable(Boolean(json.editable) && canEdit)
      setForm(soapFromDoctor(doc))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.soap_load_failed'))
    } finally {
      setLoading(false)
    }
  }, [encounterId, canEdit, t])

  useEffect(() => {
    void loadDoctorSoap()
  }, [loadDoctorSoap])

  const displaySoap = useMemo(() => {
    if (doctorSoap) return soapFromDoctor(doctorSoap)
    return soapFromAi(aiSoap)
  }, [doctorSoap, aiSoap])

  const hasDoctorSoap = Boolean(doctorSoap)
  const showingAiDraft = !hasDoctorSoap && Boolean(aiSoap)
  const hasAnySoap = hasDoctorSoap || Boolean(aiSoap)

  const startEdit = () => {
    setForm(displaySoap)
    setSeededFromAi(showingAiDraft)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setForm(displaySoap)
    setSeededFromAi(false)
  }

  const resetFromAi = () => {
    if (!aiSoap) return
    setForm(soapFromAi(aiSoap))
    if (!hasDoctorSoap) setSeededFromAi(true)
    setResetConfirmOpen(false)
  }

  const saveSoap = async () => {
    const fields: Array<keyof SoapFields> = [
      'subjective_text',
      'objective_text',
      'assessment_text',
      'plan_text',
    ]
    for (const field of fields) {
      if (!form[field].trim()) {
        toast.error(t('encounter_modal.soap_all_sections_required'))
        return
      }
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/doctor-soap`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          seeded_from_ai: seededFromAi && !hasDoctorSoap,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) return
        throw new Error(json.error || t('encounter_modal.soap_save_failed'))
      }

      setDoctorSoap(json.doctor_soap as DoctorSoap)
      setLastAudit((json.last_audit as SoapAudit | null) ?? null)
      setForm(soapFromDoctor(json.doctor_soap as DoctorSoap))
      setEditing(false)
      setSeededFromAi(false)
      toast.success(t('encounter_modal.soap_saved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.soap_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const formatAudit = (audit: SoapAudit) => {
    const when = formatClinicDateTimeForLanguage(audit.created_at, language)
    const name = audit.editor_name || t('common.unknown')
    const roleLabel =
      audit.editor_role === 'doctor'
        ? t('encounter_modal.soap_role_doctor')
        : audit.editor_role === 'nurse' || audit.editor_role === 'staff'
          ? t('encounter_modal.soap_role_nurse')
          : audit.editor_role === 'admin'
            ? t('encounter_modal.soap_role_admin')
            : audit.editor_role || ''
    return t('encounter_modal.soap_last_edited', { name, role: roleLabel, when })
  }

  const renderReadonlySection = (label: string, value: string) => (
    <div>
      <p className="text-slate-500 text-sm mb-2 font-semibold">{label}</p>
      <p className="text-slate-900 bg-[#f9fbff] border border-slate-200 p-3 rounded-lg text-sm whitespace-pre-wrap">
        {value || t('encounter_modal.soap_placeholder')}
      </p>
    </div>
  )

  const renderEditSection = (
    label: string,
    field: keyof SoapFields,
    rows = 4
  ) => (
    <div>
      <label className="text-slate-500 text-sm mb-2 font-semibold block">{label}</label>
      <textarea
        value={form[field]}
        onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
        rows={rows}
        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
      />
    </div>
  )

  const canShareDoctorSoap = !editing && hasAnySoap

  const emailSoapToPatient = async () => {
    setEmailing(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/doctor-soap/email`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || json.message || t('encounter_modal.soap_email_failed'))
      toast.success(t('encounter_modal.soap_email_sent'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.soap_email_failed'))
    } finally {
      setEmailing(false)
    }
  }

  const canDownloadDoctorSoap = Boolean(onDownloadDoctorPdf) && canShareDoctorSoap

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex justify-center">
        <LoadingSpinner message={t('common.loading')} size="sm" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900">{t('encounter_modal.doctor_soap_notes')}</h3>
            {showingAiDraft && !editing ? (
              <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-100">
                {t('encounter_modal.soap_ai_draft_badge')}
              </span>
            ) : null}
          </div>
          {lastAudit ? (
            <p className="text-xs text-violet-700 mt-2 font-medium">{formatAudit(lastAudit)}</p>
          ) : null}
          {showingAiDraft ? (
            <p className="text-xs text-slate-500 mt-1">{t('encounter_modal.soap_ai_draft_hint')}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && !editing ? (
            <EncounterSectionEditButton
              onClick={startEdit}
              label={hasAnySoap ? undefined : t('encounter_modal.soap_start_blank')}
            />
          ) : null}
          {canDownloadDoctorSoap ? (
            <button
              type="button"
              onClick={() => onDownloadDoctorPdf?.(displaySoap)}
              title={t('encounter_modal.download_doctor_soap_pdf')}
              aria-label={t('encounter_modal.download_doctor_soap_pdf')}
              className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-violet-700 hover:bg-violet-50 border border-transparent hover:border-violet-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          ) : null}
          {canShareDoctorSoap ? (
            <button
              type="button"
              onClick={() => void emailSoapToPatient()}
              disabled={emailing}
              title={t('encounter_modal.email_soap_to_patient')}
              aria-label={t('encounter_modal.email_soap_to_patient')}
              className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-violet-700 hover:bg-violet-50 border border-transparent hover:border-violet-200 transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {!hasAnySoap && !editing ? (
        <p className="text-slate-600">{t('encounter_modal.soap_not_available')}</p>
      ) : editing ? (
        <div className="space-y-4">
          {renderEditSection(t('encounter_modal.soap_subjective'), 'subjective_text', 5)}
          {renderEditSection(t('encounter_modal.soap_objective'), 'objective_text', 5)}
          {renderEditSection(t('encounter_modal.soap_assessment'), 'assessment_text', 4)}
          {renderEditSection(t('encounter_modal.soap_plan'), 'plan_text', 4)}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => void saveSoap()}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
            >
              {t('common.cancel')}
            </button>
            {aiSoap ? (
              <button
                type="button"
                onClick={() => setResetConfirmOpen(true)}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-800 text-sm font-medium hover:bg-sky-100 disabled:opacity-50"
              >
                {t('encounter_modal.soap_reset_from_ai')}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {renderReadonlySection(t('encounter_modal.soap_subjective'), displaySoap.subjective_text)}
          {renderReadonlySection(t('encounter_modal.soap_objective'), displaySoap.objective_text)}
          {renderReadonlySection(t('encounter_modal.soap_assessment'), displaySoap.assessment_text)}
          {renderReadonlySection(t('encounter_modal.soap_plan'), displaySoap.plan_text)}
        </div>
      )}
      <ConfirmDialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={resetFromAi}
        title={t('encounter_modal.soap_reset_from_ai_title')}
        message={t('encounter_modal.soap_reset_from_ai_confirm')}
        confirmLabel={t('encounter_modal.soap_reset_from_ai')}
        accent="violet"
        icon={
          <div
            className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-sky-100 text-sky-700"
            aria-hidden
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
        }
      />
    </div>
  )
}
