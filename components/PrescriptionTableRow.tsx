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

const cellPad = 'px-3 py-3'
const cellInput =
  'w-full min-w-[7rem] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200'

const COL = {
  controls: 'min-w-[5.5rem] w-[5.5rem]',
  medication: 'min-w-[11rem] w-[11rem]',
  strength: 'min-w-[8.5rem] w-[8.5rem]',
  sig: 'min-w-[11rem] w-[11rem]',
  route: 'min-w-[8rem] w-[8rem]',
  frequency: 'min-w-[8.5rem] w-[8.5rem]',
  duration: 'min-w-[9rem] w-[9rem]',
  quantity: 'min-w-[8.5rem] w-[8.5rem]',
  refills: 'min-w-[7rem] w-[7rem]',
  notes: 'min-w-[10rem] w-[10rem]',
} as const

type RowControlsProps = {
  editLabel: string
  deleteLabel: string
  dragLabel: string
  onEdit?: () => void
  onDelete?: () => void
  editDisabled?: boolean
  deleteDisabled?: boolean
  dragDisabled?: boolean
  draggable?: boolean
  onDragStart?: (e: React.DragEvent<HTMLButtonElement>) => void
  onDragOver?: (e: React.DragEvent<HTMLTableRowElement>) => void
  onDrop?: (e: React.DragEvent<HTMLTableRowElement>) => void
  onDragEnd?: () => void
  isDragOver?: boolean
}

const iconBtn =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors'

function PrescriptionRowIconControls({
  editLabel,
  deleteLabel,
  dragLabel,
  onEdit,
  onDelete,
  editDisabled = false,
  deleteDisabled = false,
  dragDisabled = false,
  draggable = false,
  onDragStart,
}: Pick<
  RowControlsProps,
  | 'editLabel'
  | 'deleteLabel'
  | 'dragLabel'
  | 'onEdit'
  | 'onDelete'
  | 'editDisabled'
  | 'deleteDisabled'
  | 'dragDisabled'
  | 'draggable'
  | 'onDragStart'
>) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label={dragLabel}
        title={dragLabel}
        disabled={dragDisabled}
        draggable={draggable && !dragDisabled}
        onDragStart={onDragStart}
        className={`${iconBtn} cursor-grab active:cursor-grabbing`}
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
          <path d="M7 4a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM7 9a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM7 14a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2z" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={editLabel}
        title={editLabel}
        disabled={editDisabled || !onEdit}
        onClick={onEdit}
        className={`${iconBtn} hover:text-violet-700 hover:bg-violet-50`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      </button>
      <button
        type="button"
        aria-label={deleteLabel}
        title={deleteLabel}
        disabled={deleteDisabled || !onDelete}
        onClick={onDelete}
        className={`${iconBtn} hover:text-red-700 hover:bg-red-50`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  )
}

function filterSuggestions(query: string, options: readonly string[], limit = 5): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return options
    .filter((item) => item.toLowerCase().includes(q) && item.toLowerCase() !== q)
    .slice(0, limit)
}

function CellSuggestions({
  suggestions,
  onPick,
}: {
  suggestions: string[]
  onPick: (value: string) => void
}) {
  if (suggestions.length === 0) return null
  return (
    <ul className="absolute left-0 right-0 top-full z-20 mt-0.5 max-h-36 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
      {suggestions.map((item) => (
        <li key={item}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(item)}
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <span className="truncate">{item}</span>
            <kbd className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1 text-[10px] text-slate-400">
              Tab
            </kbd>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function PrescriptionTableHeader({ showControls }: { showControls: boolean }) {
  const { t } = useT()
  return (
    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
      <tr>
        {showControls && <th className={`${cellPad} ${COL.controls}`} aria-label={t('encounter_modal.rx_table_actions')} />}
        <th className={`${cellPad} ${COL.medication}`}>{t('rx.col_medication')}</th>
        <th className={`${cellPad} ${COL.strength}`}>{t('encounter_modal.rx_strength')}</th>
        <th className={`${cellPad} ${COL.sig}`}>{t('rx.instructions')}</th>
        <th className={`${cellPad} ${COL.route}`}>{t('encounter_modal.rx_route')}</th>
        <th className={`${cellPad} ${COL.frequency}`}>{t('encounter_modal.rx_frequency')}</th>
        <th className={`${cellPad} ${COL.duration}`}>{t('encounter_modal.rx_duration')}</th>
        <th className={`${cellPad} ${COL.quantity}`}>{t('rx.quantity')}</th>
        <th className={`${cellPad} ${COL.refills}`}>{t('rx.refills')}</th>
        <th className={`${cellPad} ${COL.notes}`}>{t('rx.notes')}</th>
      </tr>
    </thead>
  )
}

type InputRowProps = {
  value: StructuredRxForm
  onChange: React.Dispatch<React.SetStateAction<StructuredRxForm>>
  idPrefix: string
  rowClassName?: string
  showControls?: boolean
  rowControls?: Omit<RowControlsProps, 'editLabel' | 'deleteLabel' | 'dragLabel'>
  isDragOver?: boolean
}

export function PrescriptionTableInputRow({
  value,
  onChange,
  idPrefix,
  rowClassName = 'bg-violet-50/40',
  showControls = false,
  rowControls,
  isDragOver = false,
}: InputRowProps) {
  const { t } = useT()
  const [medHi, setMedHi] = useState(0)
  const [routeHi, setRouteHi] = useState(0)
  const [freqHi, setFreqHi] = useState(0)

  const set = <K extends keyof StructuredRxForm>(key: K, val: StructuredRxForm[K]) => {
    onChange((f) => ({ ...f, [key]: val }))
  }

  const medSuggestions = useMemo(
    () => filterSuggestions(value.medication_name, COMMON_MEDICATIONS, 6),
    [value.medication_name]
  )
  const routeSuggestions = useMemo(
    () => filterSuggestions(value.route, RX_ROUTES, 4),
    [value.route]
  )
  const freqSuggestions = useMemo(
    () => filterSuggestions(value.frequency, RX_FREQUENCIES, 4),
    [value.frequency]
  )

  const pick = (items: string[], hi: number, apply: (v: string) => void) => {
    if (items.length === 0) return false
    apply(items[Math.min(hi, items.length - 1)]!)
    return true
  }

  const stepRefills = (delta: number) => {
    const next = Math.min(MAX_REFILLS, Math.max(0, (Number(value.refills) || 0) + delta))
    set('refills', String(next))
  }

  return (
    <tr
      className={`${rowClassName}${isDragOver ? ' ring-2 ring-inset ring-violet-300' : ''}`}
      onDragOver={rowControls?.onDragOver}
      onDrop={rowControls?.onDrop}
      onDragEnd={rowControls?.onDragEnd}
    >
      {showControls && (
        <td className={`${cellPad} ${COL.controls} align-top`}>
          <PrescriptionRowIconControls
            editLabel={t('common.edit')}
            deleteLabel={t('common.remove')}
            dragLabel={t('encounter_modal.rx_drag_row')}
            onEdit={rowControls?.onEdit}
            onDelete={rowControls?.onDelete}
            editDisabled={rowControls?.editDisabled}
            deleteDisabled={rowControls?.deleteDisabled}
            dragDisabled={rowControls?.dragDisabled}
            draggable={rowControls?.draggable}
            onDragStart={rowControls?.onDragStart}
          />
        </td>
      )}
      <td className={`${cellPad} ${COL.medication} align-top relative`}>
        <input
          id={`${idPrefix}-med`}
          required
          value={value.medication_name}
          onChange={(e) => {
            set('medication_name', e.target.value)
            setMedHi(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && medSuggestions.length > 0 && !e.shiftKey) {
              const exact = medSuggestions.some(
                (m) => m.toLowerCase() === value.medication_name.trim().toLowerCase()
              )
              if (!exact) {
                e.preventDefault()
                pick(medSuggestions, medHi, (v) => set('medication_name', v))
              }
            }
            if (e.key === 'ArrowDown' && medSuggestions.length) {
              e.preventDefault()
              setMedHi((i) => Math.min(i + 1, medSuggestions.length - 1))
            }
            if (e.key === 'ArrowUp' && medSuggestions.length) {
              e.preventDefault()
              setMedHi((i) => Math.max(i - 1, 0))
            }
          }}
          placeholder={t('encounter_modal.rx_med_search_placeholder')}
          className={cellInput}
          autoComplete="off"
        />
        <CellSuggestions suggestions={medSuggestions} onPick={(v) => set('medication_name', v)} />
      </td>

      <td className={`${cellPad} ${COL.strength} align-top`}>
        <div className="flex rounded-md border border-slate-200 bg-white overflow-hidden">
          <input
            value={value.strength_value}
            onChange={(e) => set('strength_value', e.target.value)}
            placeholder="500"
            className="w-14 min-w-0 flex-1 border-0 px-2 py-2 text-sm focus:outline-none"
          />
          <select
            value={value.strength_unit}
            onChange={(e) => set('strength_unit', e.target.value)}
            className="border-0 border-l border-slate-200 bg-slate-50 px-2 py-2 text-xs focus:outline-none"
            aria-label={t('encounter_modal.rx_strength_unit')}
          >
            {STRENGTH_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </td>

      <td className={`${cellPad} ${COL.sig} align-top`}>
        <input
          value={value.dosage_instruction}
          onChange={(e) => set('dosage_instruction', e.target.value)}
          placeholder={t('encounter_modal.rx_sig_custom_ph')}
          className={cellInput}
        />
      </td>

      <td className={`${cellPad} ${COL.route} align-top relative`}>
        <input
          value={value.route}
          onChange={(e) => {
            set('route', e.target.value)
            setRouteHi(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && routeSuggestions.length > 0 && !e.shiftKey) {
              e.preventDefault()
              pick(routeSuggestions, routeHi, (v) => set('route', v))
            }
          }}
          placeholder="Oral, IM…"
          className={cellInput}
          autoComplete="off"
        />
        <CellSuggestions suggestions={routeSuggestions} onPick={(v) => set('route', v)} />
      </td>

      <td className={`${cellPad} ${COL.frequency} align-top relative`}>
        <input
          value={value.frequency}
          onChange={(e) => {
            set('frequency', e.target.value)
            setFreqHi(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && freqSuggestions.length > 0 && !e.shiftKey) {
              e.preventDefault()
              pick(freqSuggestions, freqHi, (v) => set('frequency', v))
            }
          }}
          placeholder="BID, PRN…"
          className={cellInput}
          autoComplete="off"
        />
        <CellSuggestions suggestions={freqSuggestions} onPick={(v) => set('frequency', v)} />
      </td>

      <td className={`${cellPad} ${COL.duration} align-top`}>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            value={value.duration_amount}
            onChange={(e) => set('duration_amount', e.target.value)}
            placeholder="10"
            className={`${cellInput} w-16 min-w-[4rem]`}
          />
          <select
            value={value.duration_unit}
            onChange={(e) => set('duration_unit', e.target.value)}
            className={`${cellInput} min-w-[5rem] flex-1`}
            aria-label={t('encounter_modal.rx_duration_unit')}
          >
            {DURATION_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </td>

      <td className={`${cellPad} ${COL.quantity} align-top`}>
        <div className="flex rounded-md border border-slate-200 bg-white overflow-hidden">
          <input
            type="number"
            min={0}
            value={value.quantity_amount}
            onChange={(e) => set('quantity_amount', e.target.value)}
            placeholder="30"
            className="w-14 min-w-0 flex-1 border-0 px-2 py-2 text-sm focus:outline-none"
          />
          <select
            value={value.quantity_unit}
            onChange={(e) => set('quantity_unit', e.target.value)}
            className="border-0 border-l border-slate-200 bg-slate-50 px-2 py-2 text-xs focus:outline-none"
            aria-label={t('encounter_modal.rx_quantity_unit')}
          >
            {QUANTITY_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </td>

      <td className={`${cellPad} ${COL.refills} align-top`}>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => stepRefills(-1)}
            className="h-9 w-8 rounded-md border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
          >
            −
          </button>
          <input
            type="number"
            min={0}
            max={MAX_REFILLS}
            value={value.refills}
            onChange={(e) => {
              const n = Math.min(MAX_REFILLS, Math.max(0, Number(e.target.value) || 0))
              set('refills', String(n))
            }}
            className="w-10 text-center rounded-md border border-slate-200 px-1 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => stepRefills(1)}
            className="h-9 w-8 rounded-md border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
          >
            +
          </button>
        </div>
      </td>

      <td className={`${cellPad} ${COL.notes} align-top`}>
        <input
          value={value.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder={t('encounter_modal.rx_notes_ph')}
          className={cellInput}
        />
      </td>

    </tr>
  )
}

export type PrescriptionDisplayRow = {
  id: number
  medication_name: string
  strength: string | null
  dosage_instruction: string | null
  route: string | null
  frequency: string | null
  duration: string | null
  quantity: string | null
  refills: number
  notes: string | null
}

type DisplayRowProps = {
  row: PrescriptionDisplayRow
  editable: boolean
  showControls: boolean
  onEdit: () => void
  onRemove: () => void
  na: string
  editLabel: string
  removeLabel: string
}

export function PrescriptionTableDisplayRow({
  row,
  editable,
  showControls,
  onEdit,
  onRemove,
  na,
  editLabel,
  removeLabel,
}: DisplayRowProps) {
  const { t } = useT()
  return (
    <tr className="hover:bg-slate-50/80">
      {showControls && (
        <td className={`${cellPad} ${COL.controls} align-top`}>
          {editable ? (
            <PrescriptionRowIconControls
              editLabel={editLabel}
              deleteLabel={removeLabel}
              dragLabel={t('encounter_modal.rx_drag_row')}
              onEdit={onEdit}
              onDelete={onRemove}
              dragDisabled
            />
          ) : null}
        </td>
      )}
      <td className={`${cellPad} ${COL.medication} font-medium text-slate-900`}>{row.medication_name}</td>
      <td className={`${cellPad} ${COL.strength} text-slate-700`}>{row.strength || na}</td>
      <td className={`${cellPad} ${COL.sig} text-slate-700`} title={row.dosage_instruction ?? ''}>
        {row.dosage_instruction || na}
      </td>
      <td className={`${cellPad} ${COL.route} text-slate-700`}>{row.route || na}</td>
      <td className={`${cellPad} ${COL.frequency} text-slate-700`}>{row.frequency || na}</td>
      <td className={`${cellPad} ${COL.duration} text-slate-700`}>{row.duration || na}</td>
      <td className={`${cellPad} ${COL.quantity} text-slate-700`}>{row.quantity || na}</td>
      <td className={`${cellPad} ${COL.refills} text-slate-700`}>{row.refills}</td>
      <td className={`${cellPad} ${COL.notes} text-slate-600`} title={row.notes ?? ''}>
        {row.notes || '—'}
      </td>
    </tr>
  )
}
