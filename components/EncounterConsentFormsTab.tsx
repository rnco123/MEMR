'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

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
      <div className="flex items-center justify-center py-16 text-slate-400">Loading consent forms…</div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-6 text-amber-200 text-sm">
        {error}
      </div>
    )
  }

  const forms = data?.forms ?? []
  if (forms.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
        <p className="mb-2">No active form templates in the database.</p>
        <p className="text-xs text-slate-500">
          Add rows to <code className="text-slate-400">forms</code> with <code className="text-slate-400">content.html</code>{' '}
          (and run migration <code className="text-slate-400">036_forms_and_signed_forms</code> if needed).
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {data?.signaturePaths && (data.signaturePaths.patient || data.signaturePaths.physician) && (
        <p className="text-xs text-slate-500">
          Signature file(s):{' '}
          {[data.signaturePaths.patient, data.signaturePaths.physician].filter(Boolean).join(' · ')}
        </p>
      )}
      {forms.map((f) => (
        <div
          key={f.id}
          className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden"
        >
          <div className="border-b border-white/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-slate-900/50">
            <h4 className="text-lg font-semibold text-white">{f.name}</h4>
            {f.updated_at && (
              <span className="text-xs text-slate-500">
                Template updated {new Date(f.updated_at).toLocaleString()}
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
