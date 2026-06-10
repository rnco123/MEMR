'use client'

import { useMemo, useState } from 'react'
import { useT } from '@/lib/i18n'
import {
  COMMON_MEDICATIONS,
  DURATION_UNITS,
  MAX_REFILLS,
  QUANTITY_UNITS,
  RX_FREQUENCIES,
  RX_ROUTES,
  STRENGTH_UNITS,
} from '@/lib/prescriptions/rx-form-options'
import type { StructuredRxForm } from '@/lib/prescriptions/rx-form-format'

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white'
const labelClass = 'text-xs font-medium text-slate-600'

type Props = {
  value: StructuredRxForm
  onChange: React.Dispatch<React.SetStateAction<StructuredRxForm>>
  idPrefix: string
}

function filterSuggestions(query: string, options: readonly string[], limit = 6): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return options
    .filter((item) => item.toLowerCase().includes(q) && item.toLowerCase() !== q)
    .slice(0, limit)
}

function SuggestionList({
  suggestions,
  onPick,
  hint,
}: {
  suggestions: string[]
  onPick: (value: string) => void
  hint: string
}) {
  if (suggestions.length === 0) return null

  return (
    <ul className="mt-1 rounded-lg border border-slate-200 bg-slate-50/90 overflow-hidden">
      {suggestions.map((item) => (
        <li key={item}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(item)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-500 hover:bg-white hover:text-slate-700 transition-colors"
          >
            <span>{item}</span>
            <span className="inline-flex items-center gap-1 shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
              <kbd className="rounded border border-slate-300 bg-white px-1 py-0.5 font-sans">Tab</kbd>
              {hint}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function PrescriptionFormFields({ value, onChange, idPrefix }: Props) {
  const { t } = useT()
  const [medHighlight, setMedHighlight] = useState(0)
  const [routeHighlight, setRouteHighlight] = useState(0)
  const [freqHighlight, setFreqHighlight] = useState(0)

  const set = <K extends keyof StructuredRxForm>(key: K, val: StructuredRxForm[K]) => {
    onChange((f) => ({ ...f, [key]: val }))
  }

  const medSuggestions = useMemo(
    () => filterSuggestions(value.medication_name, COMMON_MEDICATIONS, 8),
    [value.medication_name]
  )

  const routeSuggestions = useMemo(
    () => filterSuggestions(value.route, RX_ROUTES, 6),
    [value.route]
  )

  const freqSuggestions = useMemo(
    () => filterSuggestions(value.frequency, RX_FREQUENCIES, 6),
    [value.frequency]
  )

  const stepRefills = (delta: number) => {
    const next = Math.min(MAX_REFILLS, Math.max(0, (Number(value.refills) || 0) + delta))
    set('refills', String(next))
  }

  const pickFromList = (
    items: string[],
    highlight: number,
    apply: (item: string) => void
  ): boolean => {
    if (items.length === 0) return false
    const idx = Math.min(highlight, items.length - 1)
    apply(items[idx]!)
    return true
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
      <div className="md:col-span-12">
        <label className={labelClass} htmlFor={`${idPrefix}-med`}>
          {t('rx.medication')} *
        </label>
        <input
          id={`${idPrefix}-med`}
          required
          value={value.medication_name}
          onChange={(e) => {
            set('medication_name', e.target.value)
            setMedHighlight(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && medSuggestions.length > 0 && !e.shiftKey) {
              const exact = medSuggestions.find(
                (m) => m.toLowerCase() === value.medication_name.trim().toLowerCase()
              )
              if (!exact) {
                e.preventDefault()
                pickFromList(medSuggestions, medHighlight, (item) => set('medication_name', item))
              }
            }
            if (e.key === 'ArrowDown' && medSuggestions.length > 0) {
              e.preventDefault()
              setMedHighlight((i) => Math.min(i + 1, medSuggestions.length - 1))
            }
            if (e.key === 'ArrowUp' && medSuggestions.length > 0) {
              e.preventDefault()
              setMedHighlight((i) => Math.max(i - 1, 0))
            }
          }}
          placeholder={t('encounter_modal.rx_med_search_placeholder')}
          className={`mt-1 ${inputClass}`}
          autoComplete="off"
        />
        <SuggestionList
          suggestions={medSuggestions}
          onPick={(item) => set('medication_name', item)}
          hint={t('encounter_modal.rx_use_suggestion')}
        />
      </div>

      <div className="md:col-span-4">
        <label className={labelClass} htmlFor={`${idPrefix}-strength`}>
          {t('encounter_modal.rx_strength')}
        </label>
        <div className="mt-1 flex rounded-lg border border-slate-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-violet-200 focus-within:border-violet-400">
          <input
            id={`${idPrefix}-strength`}
            type="text"
            inputMode="decimal"
            value={value.strength_value}
            onChange={(e) => set('strength_value', e.target.value)}
            placeholder="500"
            className="flex-1 min-w-0 border-0 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-0"
          />
          <select
            aria-label={t('encounter_modal.rx_strength_unit')}
            value={value.strength_unit}
            onChange={(e) => set('strength_unit', e.target.value)}
            className="border-0 border-l border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-0"
          >
            {STRENGTH_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="md:col-span-8">
        <label className={labelClass} htmlFor={`${idPrefix}-sig`}>
          {t('rx.instructions')}
        </label>
        <input
          id={`${idPrefix}-sig`}
          value={value.dosage_instruction}
          onChange={(e) => set('dosage_instruction', e.target.value)}
          placeholder={t('encounter_modal.rx_sig_custom_ph')}
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div className="md:col-span-6">
        <label className={labelClass} htmlFor={`${idPrefix}-route`}>
          {t('encounter_modal.rx_route')}
        </label>
        <input
          id={`${idPrefix}-route`}
          value={value.route}
          onChange={(e) => {
            set('route', e.target.value)
            setRouteHighlight(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && routeSuggestions.length > 0 && !e.shiftKey) {
              e.preventDefault()
              pickFromList(routeSuggestions, routeHighlight, (item) => set('route', item))
            }
            if (e.key === 'ArrowDown' && routeSuggestions.length > 0) {
              e.preventDefault()
              setRouteHighlight((i) => Math.min(i + 1, routeSuggestions.length - 1))
            }
            if (e.key === 'ArrowUp' && routeSuggestions.length > 0) {
              e.preventDefault()
              setRouteHighlight((i) => Math.max(i - 1, 0))
            }
          }}
          placeholder={t('encounter_modal.rx_route_ph')}
          className={`mt-1 ${inputClass}`}
          autoComplete="off"
        />
        <SuggestionList
          suggestions={routeSuggestions}
          onPick={(item) => set('route', item)}
          hint={t('encounter_modal.rx_use_suggestion')}
        />
      </div>

      <div className="md:col-span-6">
        <label className={labelClass} htmlFor={`${idPrefix}-freq`}>
          {t('encounter_modal.rx_frequency')}
        </label>
        <input
          id={`${idPrefix}-freq`}
          value={value.frequency}
          onChange={(e) => {
            set('frequency', e.target.value)
            setFreqHighlight(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && freqSuggestions.length > 0 && !e.shiftKey) {
              e.preventDefault()
              pickFromList(freqSuggestions, freqHighlight, (item) => set('frequency', item))
            }
            if (e.key === 'ArrowDown' && freqSuggestions.length > 0) {
              e.preventDefault()
              setFreqHighlight((i) => Math.min(i + 1, freqSuggestions.length - 1))
            }
            if (e.key === 'ArrowUp' && freqSuggestions.length > 0) {
              e.preventDefault()
              setFreqHighlight((i) => Math.max(i - 1, 0))
            }
          }}
          placeholder={t('encounter_modal.rx_frequency_ph')}
          className={`mt-1 ${inputClass}`}
          autoComplete="off"
        />
        <SuggestionList
          suggestions={freqSuggestions}
          onPick={(item) => set('frequency', item)}
          hint={t('encounter_modal.rx_use_suggestion')}
        />
      </div>

      <div className="md:col-span-3">
        <label className={labelClass} htmlFor={`${idPrefix}-duration-amt`}>
          {t('encounter_modal.rx_duration')}
        </label>
        <input
          id={`${idPrefix}-duration-amt`}
          type="number"
          min={0}
          step={1}
          value={value.duration_amount}
          onChange={(e) => set('duration_amount', e.target.value)}
          placeholder="10"
          className={`mt-1 ${inputClass}`}
        />
      </div>
      <div className="md:col-span-3">
        <label className={labelClass} htmlFor={`${idPrefix}-duration-unit`}>
          {t('encounter_modal.rx_duration_unit')}
        </label>
        <select
          id={`${idPrefix}-duration-unit`}
          value={value.duration_unit}
          onChange={(e) => set('duration_unit', e.target.value)}
          className={`mt-1 ${inputClass}`}
        >
          {DURATION_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </div>

      <div className="md:col-span-3">
        <label className={labelClass} htmlFor={`${idPrefix}-qty`}>
          {t('rx.quantity')}
        </label>
        <div className="mt-1 flex rounded-lg border border-slate-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-violet-200 focus-within:border-violet-400">
          <input
            id={`${idPrefix}-qty`}
            type="number"
            min={0}
            step={1}
            value={value.quantity_amount}
            onChange={(e) => set('quantity_amount', e.target.value)}
            placeholder="30"
            className="flex-1 min-w-0 border-0 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-0"
          />
          <select
            aria-label={t('encounter_modal.rx_quantity_unit')}
            value={value.quantity_unit}
            onChange={(e) => set('quantity_unit', e.target.value)}
            className="border-0 border-l border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-0"
          >
            {QUANTITY_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="md:col-span-3">
        <label className={labelClass} htmlFor={`${idPrefix}-refills`}>
          {t('rx.refills')}
        </label>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => stepRefills(-1)}
            className="h-9 w-9 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            aria-label={t('encounter_modal.rx_refills_decrease')}
          >
            −
          </button>
          <input
            id={`${idPrefix}-refills`}
            type="number"
            min={0}
            max={MAX_REFILLS}
            value={value.refills}
            onChange={(e) => {
              const n = Math.min(MAX_REFILLS, Math.max(0, Number(e.target.value) || 0))
              set('refills', String(n))
            }}
            className="w-16 text-center rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"
          />
          <button
            type="button"
            onClick={() => stepRefills(1)}
            className="h-9 w-9 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            aria-label={t('encounter_modal.rx_refills_increase')}
          >
            +
          </button>
        </div>
      </div>

      <div className="md:col-span-12">
        <label className={labelClass} htmlFor={`${idPrefix}-notes`}>
          {t('rx.notes')}
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          rows={2}
          value={value.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder={t('encounter_modal.rx_notes_ph')}
          className={`mt-1 ${inputClass}`}
        />
      </div>
    </div>
  )
}
