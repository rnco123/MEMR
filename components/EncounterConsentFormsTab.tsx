'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n'

type FormRow = {
  id: number
  name: string
  html: string
  updated_at: string | null
}

type ApiOk = {
  patientName?: string
  dateDisplay?: string
  signaturePaths?: { patient: string | null; physician: string | null }
  forms: FormRow[]
  error?: string
}

export function EncounterConsentFormsTab({ encounterId }: { encounterId: number }) {
  const { t, language } = useT()
  const localeTag = language === 'es' ? 'es-ES' : 'en-US'
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ApiOk | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const headers: Record<string, string> = {}
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
        const res = await fetch(`/api/encounters/${encounterId}/consent-forms`, {
          credentials: 'include',
          headers,
        })
        const json = (await res.json()) as ApiOk & { error?: string; detail?: string }
        if (cancelled) return
        if (!res.ok) {
          setError(json.error || json.detail || `Error ${res.status}`)
          setData(null)
          return
        }
        setData({
          patientName: json.patientName,
          dateDisplay: json.dateDisplay,
          signaturePaths: json.signaturePaths,
          forms: Array.isArray(json.forms) ? json.forms : [],
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load forms')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [encounterId, supabase])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">{t('encounter_modal.forms_loading')}</div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950 text-sm">{error}</div>
    )
  }

  const forms = data?.forms ?? []
  if (forms.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
        <p className="mb-2 font-medium text-slate-800">{t('encounter_modal.forms_empty_title')}</p>
        <p className="text-xs text-slate-500">{t('encounter_modal.forms_empty_hint')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {data?.signaturePaths && (data.signaturePaths.patient || data.signaturePaths.physician) && (
        <p className="text-xs text-slate-500">
          {t('encounter_modal.forms_signature_files')}{' '}
          {[data.signaturePaths.patient, data.signaturePaths.physician].filter(Boolean).join(' · ')}
        </p>
      )}
      {forms.map((f) => (
        <div key={f.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-[#f9fbff]">
            <h4 className="text-lg font-semibold text-slate-900">{f.name}</h4>
            {f.updated_at && (
              <span className="text-xs text-slate-500">
                {t('encounter_modal.forms_template_updated')}{' '}
                {new Date(f.updated_at).toLocaleString(localeTag)}
              </span>
            )}
          </div>
          <div
            className="consent-form-html bg-white text-slate-900 p-6 md:p-8 prose prose-slate prose-sm max-w-none
              [&_h3]:text-slate-900 [&_p]:my-2 [&_strong]:text-slate-900
              [&_.consent-signature-img]:bg-white [&_.consent-signature-img]:align-middle"
            dangerouslySetInnerHTML={{ __html: f.html }}
          />
        </div>
      ))}
    </div>
  )
}
