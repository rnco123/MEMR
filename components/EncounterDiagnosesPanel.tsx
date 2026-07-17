'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

type Diagnosis = {
  id: number
  icd_code: string
  description: string
}

type AiSuggestion = {
  code: string
  description: string
  confidence?: number
  reasoning?: string
}

type MatchedSuggestion = Diagnosis & {
  suggested_code: string
  suggested_description: string
  match_type: 'exact_code' | 'nearest'
}

type EncounterDiagnosis = {
  id: number
  encounter_id: number
  diagnosis_id: number
  created_at: string
  updated_at: string
  diagnosis: Diagnosis | Diagnosis[] | null
}

type Props = {
  encounterId: number
  canEdit: boolean
  aiSuggestions?: AiSuggestion[]
  aiLoading?: boolean
  aiMessage?: string | null
}

const EMPTY_AI_SUGGESTIONS: AiSuggestion[] = []

function joinedDiagnosis(value: EncounterDiagnosis['diagnosis']): Diagnosis | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

export function EncounterDiagnosesPanel({
  encounterId,
  canEdit,
  aiSuggestions = EMPTY_AI_SUGGESTIONS,
  aiLoading = false,
  aiMessage = null,
}: Props) {
  const { t } = useT()
  const [diagnoses, setDiagnoses] = useState<EncounterDiagnosis[]>([])
  const [pending, setPending] = useState<Diagnosis[]>([])
  const [matchedSuggestions, setMatchedSuggestions] = useState<MatchedSuggestion[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Diagnosis[]>([])
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState(false)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [workingId, setWorkingId] = useState<number | null>(null)
  const [searched, setSearched] = useState(false)

  const selectedDiagnosisIds = useMemo(
    () => new Set([...diagnoses.map((row) => row.diagnosis_id), ...pending.map((row) => row.id)]),
    [diagnoses, pending]
  )

  const loadDiagnoses = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/encounters/${encounterId}/diagnoses`, {
        credentials: 'include',
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || t('encounter_diagnoses.load_failed'))
      setDiagnoses((json.diagnoses ?? []) as EncounterDiagnosis[])
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('encounter_diagnoses.load_failed')
      )
    } finally {
      setLoading(false)
    }
  }, [encounterId, t])

  useEffect(() => {
    setPending([])
    void loadDiagnoses()
  }, [loadDiagnoses])

  useEffect(() => {
    if (aiSuggestions.length === 0) {
      setMatchedSuggestions([])
      setMatching(false)
      return
    }

    const controller = new AbortController()
    setMatching(true)
    void (async () => {
      try {
        const response = await fetch('/api/diagnoses', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ suggestions: aiSuggestions }),
          signal: controller.signal,
        })
        const json = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(json.error || t('encounter_diagnoses.match_failed'))
        }
        setMatchedSuggestions((json.matches ?? []) as MatchedSuggestion[])
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setMatchedSuggestions([])
        toast.error(
          error instanceof Error ? error.message : t('encounter_diagnoses.match_failed')
        )
      } finally {
        if (!controller.signal.aborted) setMatching(false)
      }
    })()

    return () => controller.abort()
  }, [aiSuggestions, t])

  useEffect(() => {
    const trimmed = query.trim()
    if (!canEdit || trimmed.length < 2) {
      setResults([])
      setSearching(false)
      setSearched(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const response = await fetch(`/api/diagnoses?q=${encodeURIComponent(trimmed)}`, {
          credentials: 'include',
          signal: controller.signal,
        })
        const json = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(json.error || t('encounter_diagnoses.search_failed'))
        setResults((json.diagnoses ?? []) as Diagnosis[])
        setSearched(true)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setResults([])
        setSearched(true)
        toast.error(
          error instanceof Error ? error.message : t('encounter_diagnoses.search_failed')
        )
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 300)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [canEdit, query, t])

  const addPendingDiagnosis = (diagnosis: Diagnosis) => {
    if (!canEdit || saving || selectedDiagnosisIds.has(diagnosis.id)) return
    setPending((current) => [...current, diagnosis])
    setResults((current) => current.filter((item) => item.id !== diagnosis.id))
    setQuery('')
    setSearched(false)
  }

  const savePendingDiagnoses = async () => {
    if (!canEdit || saving || pending.length === 0) return
    setSaving(true)
    try {
      const response = await fetch(`/api/encounters/${encounterId}/diagnoses`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagnosis_ids: pending.map((diagnosis) => diagnosis.id) }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || t('encounter_diagnoses.save_failed'))
      setDiagnoses((current) => [...current, ...((json.data ?? []) as EncounterDiagnosis[])])
      setPending([])
      toast.success(t('encounter_diagnoses.saved'))
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('encounter_diagnoses.save_failed')
      )
    } finally {
      setSaving(false)
    }
  }

  const removeDiagnosis = async (row: EncounterDiagnosis) => {
    if (!canEdit || workingId != null) return
    setWorkingId(row.diagnosis_id)
    try {
      const response = await fetch(
        `/api/encounters/${encounterId}/diagnoses/${row.id}`,
        { method: 'DELETE', credentials: 'include' }
      )
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || t('encounter_diagnoses.remove_failed'))
      setDiagnoses((current) => current.filter((item) => item.id !== row.id))
      toast.success(t('encounter_diagnoses.removed'))
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('encounter_diagnoses.remove_failed')
      )
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6m7 2V7a2 2 0 00-2-2h-2.2a3 3 0 00-5.6 0H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2z" />
          </svg>
        </span>
        <div>
          <h3 className="text-lg font-bold text-slate-900">{t('encounter_diagnoses.title')}</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {t('encounter_diagnoses.subtitle')}
          </p>
        </div>
      </div>

      {(aiLoading || aiMessage || aiSuggestions.length > 0) && (
        <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-sky-900">
                {t('encounter_modal.icd_title')}
              </h4>
              <p className="mt-1 text-xs text-sky-800">{t('encounter_modal.icd_disclaimer')}</p>
            </div>
            {(aiLoading || matching) && (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-700"
                role="status"
                aria-label={
                  aiLoading
                    ? t('encounter_modal.loading_suggestions')
                    : t('encounter_diagnoses.matching')
                }
              />
            )}
          </div>

          {!aiLoading && aiMessage && aiSuggestions.length === 0 && (
            <p className="mt-3 text-sm text-amber-900">{aiMessage}</p>
          )}

          {!aiLoading && aiSuggestions.length > 0 && (
            <ul className="mt-3 grid gap-3 lg:grid-cols-2">
              {aiSuggestions.map((suggestion, index) => {
                const diagnosis =
                  matchedSuggestions.find(
                    (match) =>
                      match.suggested_code.toLocaleLowerCase() ===
                      suggestion.code.toLocaleLowerCase()
                  ) ?? null
                const selected = diagnosis ? selectedDiagnosisIds.has(diagnosis.id) : false
                const content = (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-sky-700">
                        {suggestion.code}
                      </span>
                      {suggestion.confidence != null && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                          {suggestion.confidence}%
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {suggestion.description}
                    </p>
                    {suggestion.reasoning && (
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        {suggestion.reasoning}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      {diagnosis ? (
                        <span className="text-sky-800">
                          {diagnosis.match_type === 'nearest'
                            ? `${diagnosis.icd_code}: ${diagnosis.description}`
                            : t('encounter_diagnoses.ai_matches')}
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          {matching
                            ? t('encounter_diagnoses.matching')
                            : t('encounter_diagnoses.no_search_results')}
                        </span>
                      )}
                      {diagnosis && canEdit && (
                        <span className="font-bold text-indigo-600">
                          {selected
                            ? t('encounter_diagnoses.selected')
                            : t('encounter_diagnoses.add')}
                        </span>
                      )}
                    </div>
                  </>
                )

                return (
                  <li key={`${suggestion.code}-${index}`}>
                    {diagnosis ? (
                      <button
                        type="button"
                        disabled={!canEdit || selected || saving}
                        onClick={() => addPendingDiagnosis(diagnosis)}
                        aria-label={`${t('encounter_diagnoses.add')} ${diagnosis.icd_code}: ${diagnosis.description}`}
                        className="h-full w-full rounded-xl border border-sky-200 bg-white p-3 text-left shadow-sm transition hover:border-sky-400 hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="h-full rounded-xl border border-sky-200 bg-white p-3">
                        {content}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {!canEdit && aiSuggestions.length > 0 && (
            <p className="mt-2 text-xs text-sky-800">
              {t('encounter_diagnoses.suggestions_read_only')}
            </p>
          )}
        </div>
      )}

      {canEdit && (
        <div className="relative mt-5">
          <label htmlFor={`diagnosis-search-${encounterId}`} className="mb-1.5 block text-xs font-semibold text-slate-600">
            {t('encounter_diagnoses.search_label')}
          </label>
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id={`diagnosis-search-${encounterId}`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('encounter_diagnoses.search_placeholder')}
              autoComplete="off"
              aria-controls={`diagnosis-results-${encounterId}`}
              aria-expanded={query.trim().length >= 2}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            {searching && (
              <span
                className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                role="status"
                aria-label={t('encounter_diagnoses.searching')}
              />
            )}
          </div>

          {query.trim().length >= 2 && !searching && (
            <div
              id={`diagnosis-results-${encounterId}`}
              role="listbox"
              aria-label={t('encounter_diagnoses.search_results')}
              className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
            >
              {results.length > 0 ? (
                results.map((diagnosis) => {
                  const selected = selectedDiagnosisIds.has(diagnosis.id)
                  return (
                    <button
                      key={diagnosis.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={selected || saving}
                      onClick={() => addPendingDiagnosis(diagnosis)}
                      className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-1 font-mono text-xs font-bold text-indigo-700">
                        {diagnosis.icd_code}
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-slate-700">
                        {diagnosis.description}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-indigo-600">
                        {selected
                          ? t('encounter_diagnoses.selected')
                          : t('encounter_diagnoses.add')}
                      </span>
                    </button>
                  )
                })
              ) : searched ? (
                <p className="px-3 py-5 text-center text-sm text-slate-500">
                  {t('encounter_diagnoses.no_search_results')}
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        {canEdit && pending.length > 0 && (
          <div className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-indigo-800">
                  {t('encounter_diagnoses.pending')}
                </h4>
                <p className="mt-1 text-xs text-slate-600">
                  {t('encounter_diagnoses.pending_hint')}
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void savePendingDiagnoses()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
            <ul className="divide-y divide-indigo-100 overflow-hidden rounded-lg border border-indigo-100 bg-white">
              {pending.map((diagnosis) => (
                <li key={diagnosis.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-1 font-mono text-xs font-bold text-indigo-700">
                    {diagnosis.icd_code}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-slate-800">
                    {diagnosis.description}
                  </span>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      setPending((current) =>
                        current.filter((item) => item.id !== diagnosis.id)
                      )
                    }
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
                    aria-label={`${t('common.remove')} ${diagnosis.icd_code}`}
                  >
                    {t('common.remove')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {t('encounter_diagnoses.confirmed')}
          </h4>
          {diagnoses.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {diagnoses.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          </div>
        ) : diagnoses.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {t('encounter_diagnoses.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {diagnoses.map((row) => {
              const diagnosis = joinedDiagnosis(row.diagnosis)
              return (
                <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1.5 font-mono text-sm font-bold text-indigo-700">
                    {diagnosis?.icd_code || '—'}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                    {diagnosis?.description || t('common.unknown')}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={workingId != null}
                      onClick={() => void removeDiagnosis(row)}
                      className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                    >
                      {t('common.remove')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {!canEdit && (
          <p className="mt-2 text-xs text-slate-400">{t('encounter_diagnoses.read_only')}</p>
        )}
      </div>
    </section>
  )
}
