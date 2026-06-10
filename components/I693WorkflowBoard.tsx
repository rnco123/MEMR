'use client'

import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { LocationCheckboxDropdown } from '@/components/LocationCheckboxDropdown'
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

const COLOR_DOT: Record<string, string> = {
  red: 'bg-red-500',
  yellow: 'bg-amber-400',
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
  const { t } = useT()
  const {
    locations: userLocations,
    unrestricted: locationsUnrestricted,
  } = useUserLocations()
  const [rows, setRows] = useState<ApiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [view, setView] = useState<'list' | 'kanban'>('kanban')
  const [patientSearch, setPatientSearch] = useState('')
  const [movingEncounterId, setMovingEncounterId] = useState<number | null>(null)
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([])

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
    if (selectedLocationIds.length === 0) return

    const availableIds = new Set(userLocations.map((loc) => loc.id))
    setSelectedLocationIds((current) => {
      const next = current.filter((id) => availableIds.has(id))
      if (next.length === current.length) return current
      return next.length === userLocations.length ? [] : next
    })
  }, [selectedLocationIds.length, userLocations])

  const filtered = useMemo(() => {
    const q = patientSearch.trim().toLowerCase()
    return rows.filter((r) => {
      if (!r.case) return false
      if (statusFilter !== 'all' && r.case.status !== statusFilter) return false
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
      delivered: [],
    }
    for (const r of filtered) {
      if (r.case) map[r.case.status].push(r)
    }
    return map
  }, [filtered])

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
        setRows(previousRows)
      } finally {
        setMovingEncounterId(null)
      }
    },
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

  const renderCard = (row: ApiRow) => {
    const c = row.case!
    const appt =
      row.appointment_date &&
      `${row.appointment_date}${row.appointment_time ? ` ${row.appointment_time}` : ''}`

    return (
      <div
        key={row.encounter_id}
        draggable={movingEncounterId !== row.encounter_id}
        onDragStart={(event) => handleCardDragStart(event, row.encounter_id)}
        className={`rounded-xl border bg-white p-3 shadow-sm transition-shadow ${
          selectedEncounterId === row.encounter_id
            ? 'border-[#2E6EF3] ring-2 ring-[#2E6EF3]/20'
            : 'border-slate-200 hover:border-slate-300'
        } ${movingEncounterId === row.encounter_id ? 'opacity-60' : 'cursor-move'}`}
      >
        <button
          type="button"
          onClick={() => onSelectEncounter(row.encounter_id, row.patient_name)}
          className="w-full text-left"
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
            <p className="text-[11px] text-slate-500 mt-2" title={c.status_updated_at ?? undefined}>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 min-h-[400px]">
          {WORKFLOW_COLUMNS.map((col) => (
            <div
              key={col.status}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleColumnDrop(event, col.status)}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 flex flex-col min-h-[320px]"
            >
              <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                <span>{col.emoji}</span>
                <h3 className="text-sm font-semibold text-slate-800">{t(col.labelKey)}</h3>
                <span className="ml-auto text-xs text-slate-500">{byColumn[col.status].length}</span>
              </div>
              <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-16rem)]">
                {byColumn[col.status].map((row) => renderCard(row))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
