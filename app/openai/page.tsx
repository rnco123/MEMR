'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  connected?: boolean
  message?: string
  error?: string
  detail?: string
  sampleModelsReturned?: number
}

export default function OpenAiSetupPage() {
  const [result, setResult] = useState<TestResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/openai/test', { cache: 'no-store' })
        const json = (await res.json()) as TestResult
        if (!cancelled) setResult(json)
      } catch (e) {
        if (!cancelled) {
          setResult({
            connected: false,
            error: e instanceof Error ? e.message : 'Failed to reach /api/openai/test',
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold mb-2">OpenAI setup check</h1>
      <p className="text-slate-400 text-sm mb-8 text-center max-w-md">
        Server calls OpenAI with <code className="text-rose-300">OPENAI_API_KEY</code> (never sent to the
        browser). Uses GET <code className="text-slate-300">/v1/models</code> as a minimal auth test.
      </p>

      {loading && <p className="text-slate-300">Testing…</p>}

      {!loading && result?.connected && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-8 py-6 text-center">
          <p className="text-emerald-300 text-lg font-semibold mb-1">Connected</p>
          <p className="text-emerald-100/90 text-sm">{result.message}</p>
          {typeof result.sampleModelsReturned === 'number' && (
            <p className="text-emerald-200/70 text-xs mt-2">Sample response included {result.sampleModelsReturned} model(s).</p>
          )}
        </div>
      )}

      {!loading && result && !result.connected && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-8 py-6 text-center max-w-lg">
          <p className="text-amber-200 text-lg font-semibold mb-2">Not connected</p>
          <p className="text-amber-100/90 text-sm">{result.error}</p>
          {result.detail && (
            <pre className="mt-3 text-left text-xs text-amber-200/80 whitespace-pre-wrap break-all">
              {result.detail}
            </pre>
          )}
          <p className="text-slate-500 text-xs mt-4">
            Set OPENAI_API_KEY in <code className="text-slate-400">.env</code> and restart{' '}
            <code className="text-slate-400">next dev</code>.
          </p>
        </div>
      )}
    </div>
  )
}
