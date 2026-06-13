'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { EncounterPatientInfo, PatientInfoAuditSummary, PatientInfoUpdatePayload } from '@/lib/encounter/encounter-patient-info'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'

function patientAgeFromDob(dob: string | null): number | null {
  if (!dob) return null
  const birthDate = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

type Props = {
  encounterId: number
  canEdit: boolean
  encounterStatus?: string | null
  onPatientUpdated?: (patient: EncounterPatientInfo) => void
}

const INPUT_CLASS =
  'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900'

const GENDER_OPTIONS = [
  { value: 'male', labelKey: 'common.male' },
  { value: 'female', labelKey: 'common.female' },
  { value: 'other', labelKey: 'common.others' },
] as const

function normalizeGenderValue(value: string | null | undefined): (typeof GENDER_OPTIONS)[number]['value'] | null {
  const g = (value ?? '').trim().toLowerCase()
  if (!g) return null
  if (g === 'male') return 'male'
  if (g === 'female') return 'female'
  return 'other'
}

function genderDisplayLabel(value: string | null | undefined, t: (key: string) => string): string {
  const normalized = normalizeGenderValue(value)
  if (!normalized) return t('common.na')
  const opt = GENDER_OPTIONS.find((o) => o.value === normalized)
  return opt ? t(opt.labelKey) : value || t('common.na')
}

export function EncounterPatientInfoPanel({
  encounterId,
  canEdit,
  encounterStatus = null,
  onPatientUpdated,
}: Props) {
  const { t, language } = useT()
  const localeTag = language === 'es' ? 'es-ES' : 'en-US'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [patient, setPatient] = useState<EncounterPatientInfo | null>(null)
  const [lastAudit, setLastAudit] = useState<PatientInfoAuditSummary>(null)
  const [editable, setEditable] = useState(canEdit)
  const [form, setForm] = useState<PatientInfoUpdatePayload | null>(null)

  const loadPatientInfo = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/patient-info`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('encounter_modal.patient_info_load_failed'))

      const p = json.patient as EncounterPatientInfo
      setPatient(p)
      const { id: _id, patient_code: _code, ...editable } = p
      setForm(editable)
      setLastAudit((json.last_audit as PatientInfoAuditSummary) ?? null)
      setEditable(Boolean(json.editable) && canEdit)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.patient_info_load_failed'))
    } finally {
      setLoading(false)
    }
  }, [encounterId, canEdit, t])

  useEffect(() => {
    void loadPatientInfo()
  }, [loadPatientInfo])

  const isCompleted = encounterStatus === 'completed'
  const displayAge = useMemo(() => patientAgeFromDob(patient?.date_of_birth ?? null), [patient?.date_of_birth])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('common.na')
    return new Date(dateString).toLocaleDateString(localeTag, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatAudit = (audit: NonNullable<PatientInfoAuditSummary>) => {
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
    return t('encounter_modal.patient_info_last_edited', { name, role: roleLabel, when })
  }

  const startEdit = () => {
    if (patient) {
      const { id: _id, patient_code: _code, ...editable } = patient
      setForm(editable)
      setEditing(true)
    }
  }

  const cancelEdit = () => {
    setEditing(false)
    if (patient) {
      const { id: _id, patient_code: _code, ...editable } = patient
      setForm(editable)
    }
  }

  const savePatientInfo = async () => {
    if (!form) return
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error(t('encounter_modal.patient_info_name_required'))
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/patient-info`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('encounter_modal.patient_info_save_failed'))

      const saved = json.patient as EncounterPatientInfo
      setPatient(saved)
      const { id: _sid, patient_code: _scode, ...editableSaved } = saved
      setForm(editableSaved)
      setLastAudit((json.last_audit as PatientInfoAuditSummary) ?? null)
      setEditing(false)
      onPatientUpdated?.(saved)
      toast.success(t('encounter_modal.patient_info_saved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('encounter_modal.patient_info_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex justify-center">
        <LoadingSpinner message={t('common.loading')} size="sm" />
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-slate-600">{t('encounter_modal.patient_not_available')}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {t('encounter_modal.patient_info')}
          </h3>
          <p className="text-xs text-slate-500 mt-1">{t('encounter_modal.patient_info_edit_hint')}</p>
          {lastAudit ? (
            <p className="text-xs text-violet-700 mt-2 font-medium">{formatAudit(lastAudit)}</p>
          ) : null}
          {isCompleted ? (
            <p className="text-xs text-amber-700 mt-2 font-medium">{t('encounter_modal.patient_info_locked_completed')}</p>
          ) : editable ? (
            <p className="text-xs text-emerald-700 mt-2">{t('encounter_modal.patient_info_editable_until_completed')}</p>
          ) : null}
        </div>
        {editable && !editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
          >
            {t('common.edit')}
          </button>
        ) : null}
      </div>

      {editing && form ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-500 text-sm mb-1 font-semibold block">{t('encounter_modal.patient_first_name')}</label>
              <input
                value={form.first_name}
                onChange={(e) => setForm((f) => (f ? { ...f, first_name: e.target.value } : f))}
                className={INPUT_CLASS}
                required
              />
            </div>
            <div>
              <label className="text-slate-500 text-sm mb-1 font-semibold block">{t('encounter_modal.patient_last_name')}</label>
              <input
                value={form.last_name}
                onChange={(e) => setForm((f) => (f ? { ...f, last_name: e.target.value } : f))}
                className={INPUT_CLASS}
                required
              />
            </div>
            <div>
              <label className="text-slate-500 text-sm mb-1 font-semibold block">{t('encounter_modal.patient_code')}</label>
              <p className="text-slate-900 font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {patient.patient_code || t('common.na')}
              </p>
              <p className="text-xs text-slate-400 mt-1">{t('encounter_modal.patient_code_readonly')}</p>
            </div>
            <div>
              <span className="text-slate-500 text-sm mb-2 font-semibold block">{t('common.gender')}</span>
              <div className="flex flex-wrap gap-4">
                {GENDER_OPTIONS.map((opt) => (
                  <label key={opt.value} className="inline-flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="patient-gender"
                      value={opt.value}
                      checked={normalizeGenderValue(form.gender) === opt.value}
                      onChange={() => setForm((f) => (f ? { ...f, gender: opt.value } : f))}
                      className="w-4 h-4 accent-violet-600"
                    />
                    {t(opt.labelKey)}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-slate-500 text-sm mb-1 font-semibold block">{t('common.dob')}</label>
              <input
                type="date"
                value={form.date_of_birth ?? ''}
                onChange={(e) => setForm((f) => (f ? { ...f, date_of_birth: e.target.value || null } : f))}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="text-slate-500 text-sm mb-1 font-semibold block">{t('common.email')}</label>
              <input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm((f) => (f ? { ...f, email: e.target.value } : f))}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="text-slate-500 text-sm mb-1 font-semibold block">{t('common.phone')}</label>
              <input
                value={form.phone ?? ''}
                onChange={(e) => setForm((f) => (f ? { ...f, phone: e.target.value } : f))}
                className={INPUT_CLASS}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-slate-500 text-sm mb-1 font-semibold block">{t('common.address')}</label>
              <input
                value={form.street_address ?? ''}
                onChange={(e) => setForm((f) => (f ? { ...f, street_address: e.target.value } : f))}
                className={INPUT_CLASS}
                placeholder={t('encounter_modal.patient_street_placeholder')}
              />
            </div>
            <div>
              <label className="text-slate-500 text-sm mb-1 font-semibold block">{t('encounter_modal.patient_state')}</label>
              <input
                value={form.state ?? ''}
                onChange={(e) => setForm((f) => (f ? { ...f, state: e.target.value } : f))}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="text-slate-500 text-sm mb-1 font-semibold block">{t('encounter_modal.patient_zip')}</label>
              <input
                value={form.zip_code ?? ''}
                onChange={(e) => setForm((f) => (f ? { ...f, zip_code: e.target.value } : f))}
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => void savePatientInfo()}
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
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-slate-500 text-sm mb-1">{t('common.name')}</p>
            <p className="text-slate-900 font-semibold">
              {patient.first_name} {patient.last_name}
            </p>
          </div>
          <div>
            <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.patient_code')}</p>
            <p className="text-slate-900 font-mono">{patient.patient_code || t('common.na')}</p>
          </div>
          <div>
            <p className="text-slate-500 text-sm mb-1">{t('common.age')}</p>
            <p className="text-slate-900">
              {displayAge != null
                ? t('encounter_modal.age_years', { years: String(displayAge) })
                : t('common.na')}
            </p>
          </div>
          <div>
            <p className="text-slate-500 text-sm mb-1">{t('common.gender')}</p>
            <p className="text-slate-900">{genderDisplayLabel(patient.gender, t)}</p>
          </div>
          <div>
            <p className="text-slate-500 text-sm mb-1">{t('common.dob')}</p>
            <p className="text-slate-900">{formatDate(patient.date_of_birth)}</p>
          </div>
          <div>
            <p className="text-slate-500 text-sm mb-1">{t('common.email')}</p>
            <p className="text-slate-900">{patient.email || t('common.na')}</p>
          </div>
          <div>
            <p className="text-slate-500 text-sm mb-1">{t('common.phone')}</p>
            <p className="text-slate-900">{patient.phone || t('common.na')}</p>
          </div>
          <div>
            <p className="text-slate-500 text-sm mb-1">{t('common.address')}</p>
            <p className="text-slate-900">
              {patient.street_address || t('common.na')}
              {patient.state && `, ${patient.state}`}
              {patient.zip_code && ` ${patient.zip_code}`}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
