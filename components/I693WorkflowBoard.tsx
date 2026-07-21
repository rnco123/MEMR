'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { LocationCheckboxDropdown } from '@/components/LocationCheckboxDropdown'
import { FlowboardBatchActionBar } from '@/components/FlowboardBatchActionBar'
import { formatClinicDateTimeForLanguage } from '@/lib/datetime/clinic-timezone'
import { useT } from '@/lib/i18n'
import { useUserLocations } from '@/lib/hooks/use-user-locations'
import {
  WORKFLOW_COLUMNS,
  type ImmigrationCaseRow,
  type ImmigrationWorkflowStatus,
} from '@/lib/immigration/types'

type ApiRow = {
  encounter_id: number
  patient_id: number
  patient_name: string
  appointment_date: string | null
  appointment_time: string | null
  location_id: number | null
  location_title: string | null
  i693_status: string | null
  case: ImmigrationCaseRow | null
}

type StatusFilter = 'all' | ImmigrationWorkflowStatus

const I693_LOCATION_FILTER_STORAGE_KEY = 'memr.i693.workflow.locationIds'

function readStoredLocationIds(): number[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(I693_LOCATION_FILTER_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((value) => Number(value))
      .filter((id) => Number.isFinite(id) && id > 0)
  } catch {
    return []
  }
}

function writeStoredLocationIds(ids: number[]) {
  try {
    if (ids.length === 0) {
      sessionStorage.removeItem(I693_LOCATION_FILTER_STORAGE_KEY)
    } else {
      sessionStorage.setItem(I693_LOCATION_FILTER_STORAGE_KEY, JSON.stringify(ids))
    }
  } catch {
    /* ignore quota / private mode */
  }
}

const COLOR_DOT: Record<string, string> = {
  red: 'bg-red-500',
  yellow: 'bg-amber-400',
  purple: 'bg-purple-500',
  green: 'bg-emerald-500',
  blue: 'bg-blue-500',
}

type Props = {
  selectedEncounterId: number | null
  onSelectEncounter: (id: number, patientName: string) => void
  onClearSelection?: () => void
  onOpenPdfEditor: (id: number, patientName?: string) => void
}

export function I693WorkflowBoard({
  selectedEncounterId,
  onSelectEncounter,
  onClearSelection,
  onOpenPdfEditor,
}: Props) {
  const { t, language } = useT()
  const {
    locations: userLocations,
    unrestricted: locationsUnrestricted,
    loading: locationsLoading,
  } = useUserLocations()
  const [rows, setRows] = useState<ApiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [view, setView] = useState<'list' | 'kanban'>('kanban')
  const [patientSearch, setPatientSearch] = useState('')
  const [movingEncounterId, setMovingEncounterId] = useState<number | null>(null)
  const [selectedLocationIds, setSelectedLocationIdsState] = useState<number[]>(readStoredLocationIds)
  const setSelectedLocationIds = useCallback((value: number[] | ((prev: number[]) => number[])) => {
    setSelectedLocationIdsState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      writeStoredLocationIds(next)
      return next
    })
  }, [])
  const [selectedDeliveredIds, setSelectedDeliveredIds] = useState<Set<number>>(new Set())
  const [closingForms, setClosingForms] = useState(false)

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const params = new URLSearchParams()
        selectedLocationIds.forEach((id) => params.append('location_id', String(id)))
        const url = params.size > 0 ? `/api/i693/cases?${params}` : '/api/i693/cases'
        const res = await fetch(url, { credentials: 'include', cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load cases')
        setRows((json.data ?? []) as ApiRow[])
      } catch (e) {
        console.error(e)
        if (!silent) setRows([])
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [selectedLocationIds]
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    // Wait until locations load — otherwise a restored filter is wiped against [].
    if (locationsLoading || userLocations.length === 0) return
    if (selectedLocationIds.length === 0) return

    const availableIds = new Set(userLocations.map((loc) => loc.id))
    setSelectedLocationIds((current) => {
      const next = current.filter((id) => availableIds.has(id))
      if (next.length === current.length) return current
      return next.length === userLocations.length ? [] : next
    })
  }, [locationsLoading, selectedLocationIds.length, userLocations])

  const filtered = useMemo(() => {
    const q = patientSearch.trim().toLowerCase()
    return rows.filter((r) => {
      if (!r.case) return false
      // List view: optional status tab. Kanban always shows all columns.
      if (view === 'list' && statusFilter !== 'all' && r.case.status !== statusFilter) return false
      if (view === 'list' && q) {
        const nameMatch = r.patient_name.toLowerCase().includes(q)
        const encounterMatch = String(r.encounter_id).includes(q)
        const patientIdMatch = String(r.patient_id).includes(q)
        if (!nameMatch && !encounterMatch && !patientIdMatch) return false
      }
      return true
    })
  }, [rows, statusFilter, patientSearch, view])

  const byColumn = useMemo(() => {
    const map: Record<ImmigrationWorkflowStatus, ApiRow[]> = {
      incomplete: [],
      ready_review: [],
      completed: [],
      doctor_reviewed: [],
      delivered: [],
    }
    for (const r of filtered) {
      if (r.case) map[r.case.status].push(r)
    }
    return map
  }, [filtered])

  const visibleDeliveredRows = useMemo(
    () => filtered.filter((row) => row.case?.status === 'delivered'),
    [filtered]
  )

  useEffect(() => {
    const availableIds = new Set(visibleDeliveredRows.map((row) => row.encounter_id))
    setSelectedDeliveredIds((current) => {
      const next = new Set([...current].filter((id) => availableIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [visibleDeliveredRows])

  const selectedRow = useMemo(
    () => rows.find((r) => r.encounter_id === selectedEncounterId) ?? null,
    [rows, selectedEncounterId]
  )
  const showLocationFilter = locationsUnrestricted || userLocations.length > 0

  const moveCase = useCallback(
    async (row: ApiRow, nextStatus: ImmigrationWorkflowStatus) => {
      if (!row.case || row.case.status === nextStatus || movingEncounterId === row.encounter_id) return

      const previousRows = rows
      const nextColor = WORKFLOW_COLUMNS.find((col) => col.status === nextStatus)?.color ?? row.case.status_color
      setMovingEncounterId(row.encounter_id)
      setRows((current) =>
        current.map((item) =>
          item.encounter_id === row.encounter_id && item.case
            ? {
                ...item,
                case: {
                  ...item.case,
                  status: nextStatus,
                  status_color: nextColor,
                },
              }
            : item
        )
      )

      try {
        const res = await fetch(`/api/i693/cases/${row.encounter_id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to move case')

        setRows((current) =>
          current.map((item) =>
            item.encounter_id === row.encounter_id
              ? { ...item, case: json.data as ImmigrationCaseRow }
              : item
          )
        )
      } catch (e) {
        console.error(e)
        toast.error(e instanceof Error ? e.message : t('i693.wf_move_failed'))
        setRows(previousRows)
      } finally {
        setMovingEncounterId(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t omitted: only used for a toast message, and including it would recreate this drag-handler on every language switch.
    [movingEncounterId, rows]
  )

  const handleCardDragStart = (event: DragEvent<HTMLDivElement>, encounterId: number) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(encounterId))
  }

  const handleColumnDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, status: ImmigrationWorkflowStatus) => {
      event.preventDefault()
      const encounterId = Number(event.dataTransfer.getData('text/plain'))
      const row = rows.find((item) => item.encounter_id === encounterId)
      if (row) void moveCase(row, status)
    },
    [moveCase, rows]
  )

  const deliveredColumnRows = byColumn.delivered
  const allDeliveredSelected =
    deliveredColumnRows.length > 0 &&
    deliveredColumnRows.every((row) => selectedDeliveredIds.has(row.encounter_id))
  const someDeliveredSelected = deliveredColumnRows.some((row) =>
    selectedDeliveredIds.has(row.encounter_id)
  )
  const selectAllDeliveredRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = selectAllDeliveredRef.current
    if (!el) return
    el.indeterminate = someDeliveredSelected && !allDeliveredSelected
  }, [someDeliveredSelected, allDeliveredSelected])

  const toggleDeliveredSelection = (encounterId: number) => {
    setSelectedDeliveredIds((current) => {
      const next = new Set(current)
      if (next.has(encounterId)) next.delete(encounterId)
      else next.add(encounterId)
      return next
    })
  }

  const toggleSelectAllDelivered = () => {
    if (allDeliveredSelected) {
      setSelectedDeliveredIds(new Set())
      return
    }
    setSelectedDeliveredIds(new Set(deliveredColumnRows.map((row) => row.encounter_id)))
  }

  const closeSelectedForms = async () => {
    const encounterIds = [...selectedDeliveredIds]
    if (encounterIds.length === 0) return
    if (!window.confirm(t('i693.wf_close_confirm', { count: encounterIds.length }))) return

    setClosingForms(true)
    try {
      const res = await fetch('/api/i693/cases', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encounter_ids: encounterIds }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('i693.wf_close_failed'))

      const closedIds = new Set<number>(json.data?.closed_encounter_ids ?? [])
      setRows((current) => current.filter((row) => !closedIds.has(row.encounter_id)))
      setSelectedDeliveredIds(new Set())
      toast.success(t('i693.wf_close_success', { count: closedIds.size }))
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : t('i693.wf_close_failed'))
    } finally {
      setClosingForms(false)
    }
  }

  const renderCard = (row: ApiRow) => {
    const c = row.case!
    const appt =
      row.appointment_date &&
      `${row.appointment_date}${row.appointment_time ? ` ${row.appointment_time}` : ''}`

    const isBatchSelected = c.status === 'delivered' && selectedDeliveredIds.has(row.encounter_id)

    return (
      <div
        key={row.encounter_id}
        draggable={movingEncounterId !== row.encounter_id}
        onDragStart={(event) => handleCardDragStart(event, row.encounter_id)}
        className={`relative rounded-xl border bg-white p-3 shadow-sm transition-all ${
          isBatchSelected
            ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/40'
            : selectedEncounterId === row.encounter_id
              ? 'border-[#2E6EF3] ring-2 ring-[#2E6EF3]/20'
              : 'border-slate-200 hover:border-slate-300'
        } ${movingEncounterId === row.encounter_id ? 'opacity-60' : 'cursor-move'}`}
      >
        {c.status === 'delivered' && (
          <label
            className={`absolute top-2.5 right-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg border bg-white shadow-sm cursor-pointer transition-colors ${
              isBatchSelected
                ? 'border-blue-500 text-blue-600'
                : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'
            }`}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isBatchSelected}
              onChange={() => toggleDeliveredSelection(row.encounter_id)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              aria-label={t('i693.wf_select_form', { name: row.patient_name })}
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => onSelectEncounter(row.encounter_id, row.patient_name)}
          className={`w-full text-left ${c.status === 'delivered' ? 'pr-8' : ''}`}
        >
          <p className="font-semibold text-slate-900 text-sm">{row.patient_name}</p>
          {appt && (
            <p className="text-xs text-slate-500 mt-1">
              {t('i693.wf_appt')}: {appt}
            </p>
          )}
          {row.i693_status && (
            <p className="text-xs text-slate-400 mt-0.5 capitalize">
              I-693: {row.i693_status.replaceAll('_', ' ')}
            </p>
          )}
          {c.status_updated_by_name && (
            <p
              className="text-[11px] text-slate-500 mt-2"
              title={
                c.status_updated_at
                  ? formatClinicDateTimeForLanguage(c.status_updated_at, language)
                  : undefined
              }
            >
              {t('i693.wf_moved_by', { name: c.status_updated_by_name })}
            </p>
          )}
        </button>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenPdfEditor(row.encounter_id, row.patient_name)
            }}
            className="text-xs font-medium px-2.5 py-1 rounded-md bg-[#2E6EF3] text-white hover:bg-[#1f5ad2]"
          >
            {t('i693.edit_on_pdf')}
          </button>
        </div>
      </div>
    )
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner message={t('common.loading')} variant="light" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
          {(['all', ...WORKFLOW_COLUMNS.map((c) => c.status)] as StatusFilter[]).map((s) => {
            const col = WORKFLOW_COLUMNS.find((c) => c.status === s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium ${
                  statusFilter === s ? 'bg-[#eef3ff] text-[#2E6EF3]' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {s === 'all' ? t('common.all') : `${col?.emoji ?? ''} ${t(col?.labelKey ?? s)}`}
              </button>
            )
          })}
        </div>
        {showLocationFilter && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
              {t('location.filter_label')}
            </span>
            <LocationCheckboxDropdown
              locations={userLocations}
              selectedIds={selectedLocationIds}
              onChange={setSelectedLocationIds}
              unrestricted={locationsUnrestricted}
            />
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              view === 'list' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {t('i693.wf_list')}
          </button>
          <button
            type="button"
            onClick={() => setView('kanban')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              view === 'kanban' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {t('i693.wf_kanban')}
          </button>
          <button
            type="button"
            onClick={() => void load(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {selectedDeliveredIds.size > 0 ? (
        <div className="sticky top-0 z-20">
          <FlowboardBatchActionBar
            selectedCount={selectedDeliveredIds.size}
            totalSelectableOnPage={visibleDeliveredRows.length}
            onSelectAllPage={toggleSelectAllDelivered}
            onClear={() => setSelectedDeliveredIds(new Set())}
            actionLabel={t('i693.wf_close_selected')}
            actionLoadingLabel={t('i693.wf_closing')}
            isLoading={closingForms}
            onAction={() => void closeSelectedForms()}
            selectAllLabel={t('i693.wf_select_all_delivered')}
          />
        </div>
      ) : view === 'list' && visibleDeliveredRows.length > 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              ref={selectAllDeliveredRef}
              type="checkbox"
              checked={allDeliveredSelected}
              onChange={toggleSelectAllDelivered}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              aria-label={t('i693.wf_select_all_delivered_aria')}
            />
            <span className="font-medium">{t('i693.wf_select_all_delivered')}</span>
            <span className="text-xs text-slate-400">
              ({visibleDeliveredRows.length})
            </span>
          </label>
        </div>
      ) : null}

      {selectedRow && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#2E6EF3]/25 bg-[#eef3ff] px-4 py-3">
          <p className="text-sm text-slate-800 min-w-0 flex-1">
            <span className="text-slate-500">{t('i693.selected_patient')}:</span>{' '}
            <span className="font-semibold">{selectedRow.patient_name}</span>
            <span className="text-slate-500 ml-2">
              {t('i693.encounter_label')} #{selectedRow.encounter_id}
            </span>
          </p>
          <button
            type="button"
            onClick={() => onOpenPdfEditor(selectedRow.encounter_id, selectedRow.patient_name)}
            className="px-4 py-2 rounded-lg bg-[#2E6EF3] hover:bg-[#1f5ad2] text-white text-sm font-medium"
          >
            {t('i693.edit_on_pdf')}
          </button>
          {onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm hover:bg-slate-50"
            >
              {t('i693.clear_selection')}
            </button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
          <p className="font-medium text-slate-700">{t('i693.no_cases_title')}</p>
          <p className="text-sm mt-2">{t('i693.no_cases_hint')}</p>
        </div>
      ) : view === 'list' ? (
        <div className="space-y-3">
          <input
            type="search"
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder={t('i693.wf_search_patient')}
            className="w-full h-10 px-4 border border-slate-200 rounded-xl bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]/30"
          />
          {filtered.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 text-sm">
              {t('i693.wf_no_search_results')}
            </div>
          ) : (
        <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-[calc(100vh-14rem)] overflow-y-auto">
          {filtered.map((row) => {
            const c = row.case!
            const dot = COLOR_DOT[c.status_color] ?? 'bg-slate-400'
            return (
              <li key={row.encounter_id}>
                <div
                  className={`flex items-start gap-3 px-4 py-3 ${
                    selectedEncounterId === row.encounter_id ? 'bg-[#eef3ff]' : ''
                  }`}
                >
                  {c.status === 'delivered' && (
                    <input
                      type="checkbox"
                      checked={selectedDeliveredIds.has(row.encounter_id)}
                      onChange={() => toggleDeliveredSelection(row.encounter_id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#2E6EF3] focus:ring-[#2E6EF3]"
                      aria-label={t('i693.wf_select_form', { name: row.patient_name })}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectEncounter(row.encounter_id, row.patient_name)}
                    className="flex flex-1 items-start gap-3 text-left hover:opacity-90 min-w-0"
                  >
                    <span className={`mt-1.5 w-3 h-3 rounded-full shrink-0 ${dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{row.patient_name}</p>
                      {row.appointment_date && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {t('i693.wf_appt')}: {row.appointment_date}
                          {row.appointment_time ? ` ${row.appointment_time}` : ''}
                        </p>
                      )}
                    </div>
                  </button>
                  <div className="shrink-0 flex flex-col gap-1 px-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenPdfEditor(row.encounter_id, row.patient_name)
                      }}
                      className="text-xs font-medium text-[#2E6EF3] hover:underline"
                    >
                      {t('i693.edit_on_pdf')}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 min-h-[400px]">
          {WORKFLOW_COLUMNS.map((col) => (
            <div
              key={col.status}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleColumnDrop(event, col.status)}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 flex flex-col min-h-[320px]"
            >
              <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                {col.status === 'delivered' && deliveredColumnRows.length > 0 ? (
                  <label
                    className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-white cursor-pointer shrink-0"
                    title={t('i693.wf_select_all_delivered')}
                  >
                    <input
                      ref={selectAllDeliveredRef}
                      type="checkbox"
                      checked={allDeliveredSelected}
                      onChange={toggleSelectAllDelivered}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      aria-label={t('i693.wf_select_all_delivered_aria')}
                    />
                  </label>
                ) : null}
                <span>{col.emoji}</span>
                <h3 className="text-sm font-semibold text-slate-800 truncate">{t(col.labelKey)}</h3>
                {col.status === 'delivered' && someDeliveredSelected ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full shrink-0">
                    {selectedDeliveredIds.size}
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
                  {byColumn[col.status].length}
                </span>
              </div>
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleColumnDrop(event, col.status)}
                className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-16rem)]"
              >
                {byColumn[col.status].map((row) => renderCard(row))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
