'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'

type SoapRow = {
  id: number
  subjective_text: string | null
  objective_text: string | null
  assessment_text: string | null
  plan_text: string | null
  created_at: string | null
  updated_at: string | null
  encounter_id: number | null
  priority: string | null
}

function TestSoapCompleteInner() {
  const searchParams = useSearchParams()
  const fromQuery = searchParams.get('id')
  const parsed = fromQuery != null && fromQuery !== '' ? Number(fromQuery) : NaN
  const initialId = Number.isFinite(parsed) && parsed > 0 ? parsed : 1

  const supabase = createClient()
  const [encounterId, setEncounterId] = useState(initialId)
  const [inputValue, setInputValue] = useState(String(initialId))
  const [loading, setLoading] = useState(false)
  const [triggerResult, setTriggerResult] = useState<unknown>(null)
  const [soap, setSoap] = useState<SoapRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const n = fromQuery != null && fromQuery !== '' ? Number(fromQuery) : NaN
    if (Number.isFinite(n) && n > 0) {
      setEncounterId(n)
      setInputValue(String(n))
    }
  }, [fromQuery])

  /** Avoid showing another encounter’s SOAP after switching ID */
  useEffect(() => {
    setSoap(null)
    setTriggerResult(null)
    setError(null)
  }, [encounterId])

  async function authHeaders(): Promise<Record<string, string>> {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const h: Record<string, string> = {}
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
    return h
  }

  async function loadSoapFromDb() {
    setError(null)
    const headers = await authHeaders()
    const res = await fetch(`/api/encounters/${encounterId}/ai-soapnote`, {
      credentials: 'include',
      headers,
    })
    const json = (await res.json()) as { error?: string; soap?: SoapRow | null; detail?: string }
    if (!res.ok) {
      throw new Error(json.error || json.detail || `HTTP ${res.status}`)
    }
    setSoap(json.soap ?? null)
  }

  async function runCompleteSoapAndFetch() {
    setLoading(true)
    setError(null)
    setTriggerResult(null)
    try {
      const headers = await authHeaders()
      const postRes = await fetch('/api/soap/complete-soap', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ encounter_id: String(encounterId) }),
      })
      const postJson = await postRes.json().catch(() => ({}))
      setTriggerResult(postJson)

      if (!postRes.ok) {
        const pj = postJson as { error?: string; message?: string; details?: { message?: string } }
        const reason =
          pj.message ||
          pj.details?.message ||
          pj.error ||
          `Trigger failed (${postRes.status}). See response below.`
        throw new Error(reason)
      }

      await loadSoapFromDb()
      if (!(postJson as { success?: boolean }).success) {
        setError('External API returned without success flag; DB row may still update shortly.')
      }

      await new Promise((r) => setTimeout(r, 1500))
      await loadSoapFromDb()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
      try {
        await loadSoapFromDb()
      } catch {
        /* ignore */
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Complete SOAP (test)</h1>
          <p className="text-sm text-slate-400">
            Calls <code className="text-slate-300">POST /api/soap/complete-soap</code> (proxies to Railway{' '}
            <code className="text-slate-300">complete-soapnotes</code>), then loads the latest row from{' '}
            <code className="text-slate-300">ai_soapnotes</code> for this encounter. Optional URL:{' '}
            <code className="text-slate-300">?id=12</code>
          </p>
          <p className="text-sm text-amber-200/90 mt-2 rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2">
            Railway checks the <strong className="text-amber-100">vitals</strong> table (BP, HR, temp, etc.) for{' '}
            <code className="text-amber-100/90">encounter_id</code> — not intake/chief complaint. Intake can exist
            without vitals. To verify in Supabase: open table <code className="text-amber-100/90">vitals</code>, filter{' '}
            <code className="text-amber-100/90">encounter_id = …</code>. If empty, save vitals from the virtual waiting room first,
            then trigger again.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Encounter ID</span>
            <input
              type="number"
              min={1}
              className="bg-slate-900 border border-white/15 rounded-lg px-3 py-2 text-white w-36"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
            onClick={() => {
              const n = Number(inputValue)
              if (Number.isFinite(n) && n > 0) setEncounterId(n)
            }}
          >
            Set ID
          </button>
          <button
            type="button"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-medium"
            onClick={() => runCompleteSoapAndFetch()}
          >
            {loading ? 'Running…' : 'Trigger SOAP API + load from DB'}
          </button>
          <button
            type="button"
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-white/20 text-sm text-slate-200 hover:bg-white/10"
            onClick={async () => {
              setLoading(true)
              setError(null)
              try {
                await loadSoapFromDb()
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Load failed')
              } finally {
                setLoading(false)
              }
            }}
          >
            Refresh from DB only
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-amber-100 text-sm">
            {error}
          </div>
        )}

        {triggerResult != null && (
          <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
            <h2 className="text-sm font-semibold text-slate-300 mb-2">Trigger API response</h2>
            <pre className="text-xs text-slate-400 overflow-auto max-h-48 whitespace-pre-wrap">
              {JSON.stringify(triggerResult, null, 2)}
            </pre>
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-white text-slate-900 p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">ai_soapnotes (latest for encounter)</h2>
          {!soap ? (
            <p className="text-slate-600 text-sm">No row yet for this encounter_id, or still generating.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <p className="text-slate-500 text-xs">
                id={soap.id}
                {soap.created_at && ` · created ${formatClinicDateTimeForLanguage(soap.created_at, 'en')}`}
                {soap.priority != null && ` · priority ${soap.priority}`}
              </p>
              <section>
                <h3 className="font-semibold text-slate-800 mb-1">Subjective</h3>
                <p className="whitespace-pre-wrap text-slate-800">{soap.subjective_text || '—'}</p>
              </section>
              <section>
                <h3 className="font-semibold text-slate-800 mb-1">Objective</h3>
                <p className="whitespace-pre-wrap text-slate-800">{soap.objective_text || '—'}</p>
              </section>
              <section>
                <h3 className="font-semibold text-slate-800 mb-1">Assessment</h3>
                <p className="whitespace-pre-wrap text-slate-800">{soap.assessment_text || '—'}</p>
              </section>
              <section>
                <h3 className="font-semibold text-slate-800 mb-1">Plan</h3>
                <p className="whitespace-pre-wrap text-slate-800">{soap.plan_text || '—'}</p>
              </section>
            </div>
          )}
        </div>

        <p className="text-sm text-slate-500">
          <a href="/dashboard" className="text-emerald-400 hover:underline">
            ← Dashboard
          </a>
        </p>
      </div>
    </div>
  )
}

export default function TestSoapCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          Loading…
        </div>
      }
    >
      <TestSoapCompleteInner />
    </Suspense>
  )
}
