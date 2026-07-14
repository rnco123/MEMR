'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { isForbiddenResponse } from '@/lib/http/api-response'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EncounterSectionEditButton } from '@/components/EncounterSectionEditButton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { cleanSoapSection, normalizeJsonListSnippets } from '@/lib/soap/clean-soap-section'
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

type AmendmentNote = SoapFields & {
  id: number
  encounter_id: number
  doctor_soapnote_id: number
  doctor_id: number
  amended_by: string | null
  amended_by_name: string | null
  amended_by_role: string | null
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
    subjective_text: normalizeJsonListSnippets(doc.subjective_text?.trim() ?? ''),
    objective_text: normalizeJsonListSnippets(doc.objective_text?.trim() ?? ''),
    assessment_text: normalizeJsonListSnippets(doc.assessment_text?.trim() ?? ''),
    plan_text: normalizeJsonListSnippets(doc.plan_text?.trim() ?? ''),
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
  const [resetting, setResetting] = useState(false)
  const [amendments, setAmendments] = useState<AmendmentNote[]>([])
  const [canAmend, setCanAmend] = useState(false)
  const [amendmentsLoading, setAmendmentsLoading] = useState(false)
  const [amending, setAmending] = useState(false)
  const [amendmentForm, setAmendmentForm] = useState<SoapFields>(blankForm)
  const [savingAmendment, setSavingAmendment] = useState(false)

  const isCompleted = encounterStatus === 'completed'

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

  const loadAmendments = useCallback(async () => {
    if (encounterStatus !== 'completed') {
      setAmendments([])
      setCanAmend(false)
      return
    }
    setAmendmentsLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/amendments`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) {
          setCanAmend(false)
          return
        }
        throw new Error(json.error || t('encounter_modal.amendment_load_failed'))
      }
      setAmendments((json.amendments as AmendmentNote[]) ?? [])
      setCanAmend(Boolean(json.can_amend))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.amendment_load_failed'))
    } finally {
      setAmendmentsLoading(false)
    }
  }, [encounterId, encounterStatus, t])

  useEffect(() => {
    void loadDoctorSoap()
  }, [loadDoctorSoap])

  useEffect(() => {
    void loadAmendments()
  }, [loadAmendments])

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

  // "Reset from AI" regenerates the whole note in standard medical
  // documentation language from the chart (intake, vitals, physical exam).
  // Falls back to the stored AI draft if generation fails.
  const resetFromAi = async () => {
    setResetConfirmOpen(false)
    setResetting(true)
    try {
      const res = await fetch('/api/soap/complete-soap', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encounter_id: encounterId, style: 'medical' }),
      })
      const json = await res.json()
      if (!res.ok || !json?.note) {
        throw new Error(json?.message || json?.error || t('encounter_modal.soap_reset_failed'))
      }
      setForm(soapFromAi(json.note as AiSoap))
      if (!hasDoctorSoap) setSeededFromAi(true)
    } catch (e) {
      if (aiSoap) {
        setForm(soapFromAi(aiSoap))
        if (!hasDoctorSoap) setSeededFromAi(true)
      }
      toast.error(e instanceof Error ? e.message : t('encounter_modal.soap_reset_failed'))
    } finally {
      setResetting(false)
    }
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

  const formatAmendmentMeta = (note: AmendmentNote) => {
    const when = formatClinicDateTimeForLanguage(note.created_at, language)
    const name = note.amended_by_name || t('common.unknown')
    const roleLabel =
      note.amended_by_role === 'doctor'
        ? t('encounter_modal.soap_role_doctor')
        : note.amended_by_role === 'nurse' || note.amended_by_role === 'staff'
          ? t('encounter_modal.soap_role_nurse')
          : note.amended_by_role === 'admin'
            ? t('encounter_modal.soap_role_admin')
            : note.amended_by_role || ''
    return t('encounter_modal.amendment_by', { name, role: roleLabel, when })
  }

  const latestSoapForAmendmentSeed = (): SoapFields => {
    const last = amendments[amendments.length - 1]
    if (last) {
      return {
        subjective_text: last.subjective_text ?? '',
        objective_text: last.objective_text ?? '',
        assessment_text: last.assessment_text ?? '',
        plan_text: last.plan_text ?? '',
      }
    }
    return displaySoap
  }

  const startAmendment = () => {
    setAmendmentForm(latestSoapForAmendmentSeed())
    setAmending(true)
  }

  const cancelAmendment = () => {
    setAmending(false)
    setAmendmentForm(blankForm)
  }

  const saveAmendment = async () => {
    const fields: Array<keyof SoapFields> = [
      'subjective_text',
      'objective_text',
      'assessment_text',
      'plan_text',
    ]
    for (const field of fields) {
      if (!amendmentForm[field].trim()) {
        toast.error(t('encounter_modal.soap_all_sections_required'))
        return
      }
    }

    setSavingAmendment(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/amendments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(amendmentForm),
      })
      const json = await res.json()
      if (!res.ok) {
        if (isForbiddenResponse(res.status)) return
        throw new Error(json.error || t('encounter_modal.amendment_save_failed'))
      }
      const created = json.amendment as AmendmentNote
      setAmendments((prev) => [...prev, created])
      setAmending(false)
      setAmendmentForm(blankForm)
      toast.success(t('encounter_modal.amendment_saved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.amendment_save_failed'))
    } finally {
      setSavingAmendment(false)
    }
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

  const renderAmendmentEditSection = (
    label: string,
    field: keyof SoapFields,
    rows = 4
  ) => (
    <div>
      <label className="text-slate-500 text-sm mb-2 font-semibold block">{label}</label>
      <textarea
        value={amendmentForm[field]}
        onChange={(e) => setAmendmentForm((f) => ({ ...f, [field]: e.target.value }))}
        rows={rows}
        className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
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
          {isCompleted ? (
            <p className="text-xs text-amber-800 mt-2 font-medium bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 inline-block">
              {t('encounter_modal.soap_locked_completed')}
            </p>
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
            <button
              type="button"
              onClick={() => setResetConfirmOpen(true)}
              disabled={saving || resetting}
              className="px-4 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-800 text-sm font-medium hover:bg-sky-100 disabled:opacity-50"
            >
              {resetting
                ? t('encounter_modal.soap_reset_generating')
                : t('encounter_modal.soap_reset_from_ai')}
            </button>
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

      {isCompleted ? (
        <div className="mt-8 pt-6 border-t border-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h4 className="text-base font-bold text-slate-900">{t('encounter_modal.amendments')}</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">{t('encounter_modal.amendments_hint')}</p>
            </div>
            {canAmend && !amending ? (
              <button
                type="button"
                onClick={startAmendment}
                className="px-3.5 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 shadow-sm"
              >
                {t('encounter_modal.amendment_add')}
              </button>
            ) : null}
          </div>

          {amendmentsLoading ? (
            <div className="flex justify-center py-4">
              <LoadingSpinner size="sm" compact />
            </div>
          ) : null}

          {!amendmentsLoading && amendments.length === 0 && !amending ? (
            <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5">
              {hasDoctorSoap
                ? t('encounter_modal.amendments_empty')
                : t('encounter_modal.amendments_need_doctor_soap')}
            </p>
          ) : null}

          <div className="space-y-4">
            {amendments.map((note, index) => (
              <div
                key={note.id}
                className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-amber-900">
                    {t('encounter_modal.amendment_number', { n: index + 1 })}
                  </p>
                  <p className="text-xs text-amber-800 font-medium">{formatAmendmentMeta(note)}</p>
                </div>
                {renderReadonlySection(
                  t('encounter_modal.soap_subjective'),
                  normalizeJsonListSnippets(note.subjective_text ?? '')
                )}
                {renderReadonlySection(
                  t('encounter_modal.soap_objective'),
                  normalizeJsonListSnippets(note.objective_text ?? '')
                )}
                {renderReadonlySection(
                  t('encounter_modal.soap_assessment'),
                  normalizeJsonListSnippets(note.assessment_text ?? '')
                )}
                {renderReadonlySection(
                  t('encounter_modal.soap_plan'),
                  normalizeJsonListSnippets(note.plan_text ?? '')
                )}
              </div>
            ))}
          </div>

          {amending ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-white p-4 space-y-4 shadow-sm">
              <p className="text-sm font-semibold text-amber-900">
                {t('encounter_modal.amendment_add')}
              </p>
              {renderAmendmentEditSection(t('encounter_modal.soap_subjective'), 'subjective_text', 5)}
              {renderAmendmentEditSection(t('encounter_modal.soap_objective'), 'objective_text', 5)}
              {renderAmendmentEditSection(t('encounter_modal.soap_assessment'), 'assessment_text', 4)}
              {renderAmendmentEditSection(t('encounter_modal.soap_plan'), 'plan_text', 4)}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void saveAmendment()}
                  disabled={savingAmendment}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                >
                  {savingAmendment ? t('common.saving') : t('encounter_modal.amendment_save')}
                </button>
                <button
                  type="button"
                  onClick={cancelAmendment}
                  disabled={savingAmendment}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={() => void resetFromAi()}
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
