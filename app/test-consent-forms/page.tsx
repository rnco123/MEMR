'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { EncounterConsentFormsTab } from '@/components/EncounterConsentFormsTab'

function TestConsentFormsInner() {
  const searchParams = useSearchParams()
  const fromQuery = searchParams.get('id')
  const parsed = fromQuery != null && fromQuery !== '' ? Number(fromQuery) : NaN
  const initialId = Number.isFinite(parsed) && parsed > 0 ? parsed : 17

  const [encounterId, setEncounterId] = useState(initialId)
  const [inputValue, setInputValue] = useState(String(initialId))

  useEffect(() => {
    const n = fromQuery != null && fromQuery !== '' ? Number(fromQuery) : NaN
    if (Number.isFinite(n) && n > 0) {
      setEncounterId(n)
      setInputValue(String(n))
    }
  }, [fromQuery])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Consent forms (test)</h1>
        <p className="text-sm text-slate-400 mb-6">
          Renders the same Forms tab as the encounter modal:{' '}
          <code className="text-slate-300">GET /api/encounters/[id]/consent-forms</code>. Use{' '}
          <code className="text-slate-300">?id=17</code> in the URL or set an encounter ID below.
        </p>

        <div className="flex flex-wrap items-end gap-3 mb-8">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">Encounter ID</span>
            <input
              type="number"
              min={1}
              className="bg-slate-900 border border-white/15 rounded-lg px-3 py-2 text-white w-32"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
            onClick={() => {
              const n = Number(inputValue)
              if (Number.isFinite(n) && n > 0) setEncounterId(n)
            }}
          >
            Load
          </button>
        </div>

        <EncounterConsentFormsTab encounterId={encounterId} />

        <p className="mt-10 text-sm text-slate-500">
          <a href="/dashboard" className="text-emerald-400 hover:underline">
            ← Dashboard
          </a>
        </p>
      </div>
    </div>
  )
}

export default function TestConsentFormsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          Loading…
        </div>
      }
    >
      <TestConsentFormsInner />
    </Suspense>
  )
}
