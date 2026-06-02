'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { I693FormData, I693VaccinationRow } from '@/lib/i693/types'
import { EMPTY_I693_FORM, mergeI693Form } from '@/lib/i693/types'
import {
  I693_BOOLEAN_KEYS,
  I693_UI_SECTIONS,
  getNestedValue,
  setNestedValue,
} from '@/lib/i693/field-sections'
import {
  countFilledI693Fields,
  extractFormDataFromApi,
  parseFormDataFromApi,
} from '@/lib/i693/form-api'
import { useT } from '@/lib/i18n'

type Props = {
  encounterId: number
  patientName?: string
  isImmigration?: boolean
}

const YES_NO_UNKNOWN = [
  { value: '', label: 'Unknown' },
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]

/** Force dark text on white fields (body uses light --foreground for dark pages). */
const FIELD_INPUT =
  'w-full rounded-lg border border-slate-300 bg-white text-slate-900 caret-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] focus:border-[#2E6EF3] disabled:opacity-60 disabled:cursor-not-allowed'
const FIELD_TEXTAREA = `${FIELD_INPUT} px-3 py-2 text-sm min-h-[80px]`
const FIELD_SELECT = `${FIELD_INPUT} h-10 px-3 text-sm [color-scheme:light]`
const FIELD_TEXT = `${FIELD_INPUT} h-10 px-3 text-sm`

export function I693FormEditor({ encounterId, patientName, isImmigration }: Props) {
  const { t } = useT()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [form, setForm] = useState<I693FormData>(EMPTY_I693_FORM)
  const [status, setStatus] = useState<string | null>(null)
  const [aiModel, setAiModel] = useState<string | null>(null)
  const [formRevision, setFormRevision] = useState(0)
  /** Ignore stale GET responses after AI fill or encounter switch */
  const fetchSeqRef = useRef(0)

  const applyFormState = useCallback(
    (raw: unknown, meta?: { status?: string | null; ai_model?: string | null }) => {
      const merged = parseFormDataFromApi(raw)
      setForm(merged)
      setFormRevision((n) => n + 1)
      if (meta?.status !== undefined) setStatus(meta.status)
      if (meta?.ai_model !== undefined) setAiModel(meta.ai_model)
      return merged
    },
    []
  )

  const load = useCallback(async () => {
    const seq = ++fetchSeqRef.current
    setLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/i693`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const json = await res.json()
      if (seq !== fetchSeqRef.current) return
      if (!res.ok) throw new Error(json.error || 'Failed to load I-693')

      const raw =
        extractFormDataFromApi(json) ??
        (json.submission ? extractFormDataFromApi(json.submission) : null) ??
        json.form_data

      applyFormState(raw, {
        status: json.submission?.status ?? null,
        ai_model: json.submission?.ai_model ?? null,
      })
    } catch (e) {
      if (seq === fetchSeqRef.current) {
        toast.error(e instanceof Error ? e.message : 'Load failed')
      }
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false)
    }
  }, [encounterId, applyFormState])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/i693`, {
        method: 'PUT',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_data: form, status: status === 'ai_filled' ? 'ai_filled' : 'draft' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      toast.success(t('i693.saved'))
      setStatus(json.data?.status ?? 'draft')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const aiFill = async () => {
    fetchSeqRef.current += 1
    setAiLoading(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/i693/ai-fill`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || json.message || 'AI fill failed')

      let raw = extractFormDataFromApi(json)
      if (raw == null) {
        const reload = await fetch(`/api/encounters/${encounterId}/i693`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const reloadJson = await reload.json()
        if (!reload.ok) throw new Error(reloadJson.error || 'Could not reload form after AI fill')
        raw =
          extractFormDataFromApi(reloadJson) ??
          (reloadJson.submission ? extractFormDataFromApi(reloadJson.submission) : null)
      }

      if (raw == null) {
        throw new Error('AI fill succeeded but no form data was returned')
      }

      const merged = applyFormState(raw, {
        status: 'ai_filled',
        ai_model:
          (json.model as string | undefined) ??
          (json.data as { ai_model?: string } | undefined)?.ai_model ??
          null,
      })

      const filled = countFilledI693Fields(merged)
      if (filled === 0) {
        toast.warning(t('i693.ai_empty_warn'))
      } else {
        toast.success(t('i693.ai_done'))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI fill failed')
    } finally {
      setAiLoading(false)
    }
  }

  const downloadPdf = async () => {
    setPdfLoading(true)
    try {
      await save()
      const res = await fetch(`/api/encounters/${encounterId}/i693/pdf`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `PDF export failed (${res.status})`)
      }
      const mode = res.headers.get('X-I693-Pdf-Mode')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `I-693-encounter-${encounterId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      if (mode === 'generated') {
        toast.info(t('i693.pdf_generated_hint'))
      } else if (mode === 'overlay') {
        toast.success(t('i693.pdf_overlay_filled'))
      } else {
        toast.success(t('i693.pdf_filled'))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF failed')
    } finally {
      setPdfLoading(false)
    }
  }

  const updateField = (key: string, value: string) => {
    setForm((prev) => {
      const next = mergeI693Form(prev)
      const root = next as unknown as Record<string, unknown>
      if (I693_BOOLEAN_KEYS.has(key)) {
        if (value === '') setNestedValue(root, key, null)
        else setNestedValue(root, key, value === 'true')
      } else {
        setNestedValue(root, key, value)
      }
      return mergeI693Form(next)
    })
  }

  const addVaccination = () => {
    setForm((prev) => ({
      ...prev,
      vaccinations: [
        ...prev.vaccinations,
        { vaccine_name: '', date_given: '', waiver_reason: '', not_medically_appropriate: false },
      ],
    }))
    setFormRevision((n) => n + 1)
  }

  const updateVaccination = (index: number, patch: Partial<I693VaccinationRow>) => {
    setForm((prev) => {
      const rows = [...prev.vaccinations]
      rows[index] = { ...rows[index]!, ...patch }
      return { ...prev, vaccinations: rows }
    })
  }

  const removeVaccination = (index: number) => {
    setForm((prev) => ({
      ...prev,
      vaccinations: prev.vaccinations.filter((_, i) => i !== index),
    }))
    setFormRevision((n) => n + 1)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner message={t('i693.loading')} variant="light" />
      </div>
    )
  }

  const root = form as unknown as Record<string, unknown>
  const filledCount = countFilledI693Fields(form)

  return (
    <div className="space-y-6 text-slate-900 [color-scheme:light]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {t('i693.form_title')}
            {patientName ? ` — ${patientName}` : ''}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {t('i693.encounter_label')} {encounterId}
            {status && (
              <span className="ml-2 inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium capitalize">
                {status.replaceAll('_', ' ')}
              </span>
            )}
            {aiModel && <span className="ml-2 text-xs text-slate-400">({aiModel})</span>}
            {filledCount > 0 && (
              <span className="ml-2 text-xs text-emerald-700">
                {filledCount} {t('i693.fields_filled')}
              </span>
            )}
          </p>
          {!isImmigration && (
            <p className="text-sm text-amber-700 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              {t('i693.not_immigration_warn')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void aiFill()}
            disabled={aiLoading || saving}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {aiLoading ? t('i693.ai_running') : t('i693.ai_fill')}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || aiLoading}
            className="px-4 py-2 rounded-lg bg-[#2E6EF3] hover:bg-[#1f5ad2] text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={pdfLoading || saving || aiLoading}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium disabled:opacity-50"
          >
            {pdfLoading ? t('i693.pdf_running') : t('i693.download_pdf')}
          </button>
        </div>
      </div>

      {I693_UI_SECTIONS.map((section) => (
        <div key={`${section.title}-${formRevision}`} className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">{section.title}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {section.fields.map((field) => {
              const raw = getNestedValue(root, field.key)
              const value =
                field.type === 'boolean' || I693_BOOLEAN_KEYS.has(field.key)
                  ? raw === true
                    ? 'true'
                    : raw === false
                      ? 'false'
                      : ''
                  : String(raw ?? '')

              const inputId = `i693-${encounterId}-${field.key.replace(/\./g, '-')}-r${formRevision}`

              return (
                <label
                  key={inputId}
                  htmlFor={inputId}
                  className={field.type === 'textarea' ? 'md:col-span-2' : ''}
                >
                  <span className="text-xs font-medium text-slate-600 block mb-1">{field.label}</span>
                  {field.type === 'select' || field.type === 'boolean' ? (
                    <select
                      id={inputId}
                      value={value}
                      disabled={aiLoading}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className={FIELD_SELECT}
                    >
                      {(field.type === 'boolean' ? YES_NO_UNKNOWN : field.options)?.map((o) => (
                        <option key={o.value} value={o.value} className="text-slate-900 bg-white">
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      id={inputId}
                      value={value}
                      rows={field.rows ?? 3}
                      disabled={aiLoading}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className={FIELD_TEXTAREA}
                    />
                  ) : (
                    <input
                      id={inputId}
                      type={field.type === 'date' ? 'date' : 'text'}
                      value={value}
                      disabled={aiLoading}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className={FIELD_TEXT}
                    />
                  )}
                </label>
              )
            })}
          </div>
        </div>
      ))}

      <div key={`vaccinations-${formRevision}`} className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{t('i693.vaccinations_part_title')}</h3>
          <button
            type="button"
            onClick={addVaccination}
            className="text-sm text-[#2E6EF3] font-medium hover:underline"
          >
            + {t('i693.add_vaccine')}
          </button>
        </div>
        {form.vaccinations.length === 0 ? (
          <p className="text-sm text-slate-500">{t('i693.no_vaccines')}</p>
        ) : (
          <div className="space-y-3">
            {form.vaccinations.map((row, idx) => (
              <div
                key={`vac-${formRevision}-${idx}`}
                className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
              >
                <input
                  placeholder={t('i693.vaccine_name')}
                  value={row.vaccine_name}
                  disabled={aiLoading}
                  onChange={(e) => updateVaccination(idx, { vaccine_name: e.target.value })}
                  className={FIELD_TEXT}
                />
                <input
                  type="date"
                  value={row.date_given}
                  disabled={aiLoading}
                  onChange={(e) => updateVaccination(idx, { date_given: e.target.value })}
                  className={FIELD_TEXT}
                />
                <input
                  placeholder={t('i693.waiver')}
                  value={row.waiver_reason}
                  disabled={aiLoading}
                  onChange={(e) => updateVaccination(idx, { waiver_reason: e.target.value })}
                  className={FIELD_TEXT}
                />
                <button
                  type="button"
                  onClick={() => removeVaccination(idx)}
                  className="text-sm text-red-600 hover:underline justify-self-start md:justify-self-end"
                >
                  {t('i693.remove_row')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">{t('i693.pdf_template_hint')}</p>
    </div>
  )
}
