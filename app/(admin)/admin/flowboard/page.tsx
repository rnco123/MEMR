'use client'

import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EncounterDetailModal } from '@/components/EncounterDetailModal'
import { FlowboardKanban, type FlowboardKanbanAppointment } from '@/components/FlowboardKanban'
import {
  FlowboardFilterField,
  FlowboardFilterToolbar,
  FlowboardViewToggleSlot,
  FLOWBOARD_SELECT_CLASS,
} from '@/components/FlowboardFilterToolbar'
import {
  FlowboardViewToggle,
  readFlowboardDisplayMode,
  writeFlowboardDisplayMode,
  type FlowboardDisplayMode,
} from '@/components/FlowboardViewToggle'
import {
  ENCOUNTER_STATUSES,
  getStatusAccentBarClass,
  getStatusInfo,
  type EncounterStatus,
} from '@/lib/encounter-status'
import { translateEncounterStatus } from '@/lib/encounter-status-i18n'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useEffect, useCallback } from 'react'
import { formatClinicTimeSlot } from '@/lib/datetime/clinic-timezone'
import { useT } from '@/lib/i18n'
import { SmartPatientSearchInput } from '@/components/SmartPatientSearchInput'
import { appointmentMatchesParsedPatientSearch } from '@/lib/flowboard/appointment-search-filter'
import { usePatientSearchParse } from '@/lib/hooks/use-patient-search-parse'
import { formatDobShort } from '@/lib/datetime/date-input'
import { flowboardServiceTitle } from '@/lib/flowboard/service-title'
import { compareActivityDesc } from '@/lib/flowboard/activity-sort'

type Appointment = FlowboardKanbanAppointment & {
  created_at?: string
  location_id?: number | null
  location_title?: string | null
}

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50]

function formatDob(dateString: string | null | undefined): string | null {
  return formatDobShort(dateString)
}

function parseAppointmentDateTime(date: string | null, time: string | null): Date | null {
  if (!date) return null
  const normalizedTime = time && time.trim() ? time : '00:00:00'
  const dt = new Date(`${date}T${normalizedTime}`)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export default function AdminFlowboardPage() {
  const { t, language } = useT()
  const localeTag = language === 'es' ? 'es-ES' : 'en-US'
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [allLocations, setAllLocations] = useState<{ id: number; title: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { parsed: parsedSearch, isPending: searchPending, debouncedQuery } =
    usePatientSearchParse(searchQuery)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterLocationId, setFilterLocationId] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'time' | 'name' | 'treatment'>('recent')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [selectedEncounter, setSelectedEncounter] = useState<{
    encounterId: number
    appointmentId: number
    patientId: number
    encounterStatus?: string | null
  } | null>(null)
  const [displayMode, setDisplayMode] = useState<FlowboardDisplayMode>('list')

  useEffect(() => {
    setDisplayMode(readFlowboardDisplayMode())
  }, [])

  const handleDisplayModeChange = (mode: FlowboardDisplayMode) => {
    setDisplayMode(mode)
    writeFlowboardDisplayMode(mode)
    setPage(1)
  }

  const openAppointment = (appointment: Appointment) => {
    if (appointment.encounter_id) {
      setSelectedEncounter({
        encounterId: appointment.encounter_id,
        appointmentId: appointment.id,
        patientId: appointment.patient_id,
        encounterStatus: appointment.encounter_status,
      })
    } else {
      router.push(`/admin/patient-file/${appointment.patient_id}`)
    }
  }

  const load = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      else setIsRefreshing(true)
      const res = await fetch('/api/admin/flowboard', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('admin.flow.load_failed'))
      setAppointments(json.data ?? [])
      setAllLocations(json.locations ?? [])
    } catch {
      setAppointments([])
      setAllLocations([])
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [t])

  useEffect(() => {
    void load(true)
  }, [load])

  const refreshData = () => {
    void load(false)
    setPage(1)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('common.em_dash')
    const date = new Date(`${dateString}T00:00:00`)
    if (Number.isNaN(date.getTime())) return t('common.em_dash')
    return date.toLocaleDateString(localeTag, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatTime = (timeString: string | null) => {
    const formatted = formatClinicTimeSlot(timeString)
    return formatted || '—'
  }

  const locationOptions = useMemo(
    () => allLocations.map((loc) => [loc.id, loc.title] as const),
    [allLocations]
  )

  const filteredAppointments = useMemo(() => {
    let result = [...appointments]

    if (filterLocationId !== 'all') {
      const lid = Number(filterLocationId)
      result = result.filter((a) => a.location_id === lid)
    }

    const activeParsed =
      parsedSearch && parsedSearch.raw === debouncedQuery.trim() ? parsedSearch : null
    if (activeParsed) {
      result = result.filter((appointment) =>
        appointmentMatchesParsedPatientSearch(appointment, activeParsed)
      )
    }

    if (filterStatus !== 'all') {
      result = result.filter((appointment) => appointment.encounter_status === filterStatus)
    }

    switch (sortBy) {
      case 'recent':
        result = [...result].sort(compareActivityDesc)
        break
      case 'time':
        result = [...result].sort((a, b) => {
          const dateA = parseAppointmentDateTime(a.appointment_date, a.appointment_time)
          const dateB = parseAppointmentDateTime(b.appointment_date, b.appointment_time)
          return (dateA?.getTime() ?? 0) - (dateB?.getTime() ?? 0)
        })
        break
      case 'name':
        result = [...result].sort((a, b) => {
          const nameA = `${a.patient?.last_name ?? ''} ${a.patient?.first_name ?? ''}`.trim()
          const nameB = `${b.patient?.last_name ?? ''} ${b.patient?.first_name ?? ''}`.trim()
          return nameA.localeCompare(nameB)
        })
        break
      case 'treatment':
        result = [...result].sort((a, b) =>
          flowboardServiceTitle(a, language, a.location_tenant_id).localeCompare(
            flowboardServiceTitle(b, language, b.location_tenant_id)
          )
        )
        break
    }

    return result
  }, [appointments, parsedSearch, debouncedQuery, filterStatus, filterLocationId, sortBy, language])

  const paginatedAppointments = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredAppointments.slice(start, start + pageSize)
  }, [filteredAppointments, page, pageSize])

  const totalPages = Math.ceil(filteredAppointments.length / pageSize) || 1

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">{t('admin.flow.title')}</h1>
            <p className="text-slate-500 text-sm">{t('admin.flow.subtitle')}</p>
          </div>
          <button
            onClick={refreshData}
            disabled={loading || isRefreshing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isRefreshing ? t('common.refreshing') : t('common.refresh')}
          </button>
        </div>

        <FlowboardFilterToolbar
          search={
            <SmartPatientSearchInput
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value)
                setPage(1)
              }}
              placeholder={t('admin.flow.search')}
              loading={searchPending}
            />
          }
          filters={
            <>
              <FlowboardFilterField label={t('admin.flow.sort')}>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as 'recent' | 'time' | 'name' | 'treatment')
                    setPage(1)
                  }}
                  className={FLOWBOARD_SELECT_CLASS}
                >
                  <option value="recent">{t('flow.sort_recent')}</option>
                  <option value="time">{t('admin.flow.sort_time')}</option>
                  <option value="name">{t('admin.flow.sort_name')}</option>
                  <option value="treatment">{t('admin.flow.sort_treatment')}</option>
                </select>
              </FlowboardFilterField>
              {locationOptions.length > 0 && (
                <FlowboardFilterField label={t('admin.flow.location')} wide>
                  <select
                    value={filterLocationId}
                    onChange={(e) => {
                      setFilterLocationId(e.target.value)
                      setPage(1)
                    }}
                    className={FLOWBOARD_SELECT_CLASS}
                  >
                    <option value="all">{t('admin.flow.all_locations')}</option>
                    {locationOptions.map(([id, title]) => (
                      <option key={id} value={String(id)}>
                        {title}
                      </option>
                    ))}
                  </select>
                </FlowboardFilterField>
              )}
              <FlowboardFilterField label={t('flow.status')}>
                <select
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value)
                    setPage(1)
                  }}
                  className={FLOWBOARD_SELECT_CLASS}
                >
                  <option value="all">{t('common.all')}</option>
                  {ENCOUNTER_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {translateEncounterStatus(t, status.value)}
                    </option>
                  ))}
                </select>
              </FlowboardFilterField>
              <FlowboardViewToggleSlot>
                <FlowboardViewToggle
                  value={displayMode}
                  onChange={handleDisplayModeChange}
                  accentTheme="purple"
                  listLabel={t('flow.view_list')}
                  kanbanLabel={t('flow.view_kanban')}
                />
              </FlowboardViewToggleSlot>
            </>
          }
          footer={
            <>
              <p className="text-xs text-slate-500 min-w-0">
                {t('flow.showing_x_of_y', {
                  start: filteredAppointments.length === 0 ? 0 : (page - 1) * pageSize + 1,
                  end: Math.min(page * pageSize, filteredAppointments.length),
                  total: filteredAppointments.length,
                })}
                {debouncedQuery.trim() || filterStatus !== 'all'
                  ? ` ${t('admin.flow.filtered_from', { total: appointments.length })}`
                  : ''}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                {displayMode === 'list' && (
                  <label className="text-xs text-slate-500 flex items-center gap-2 shrink-0">
                    {t('flow.per_page')}
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value))
                        setPage(1)
                      }}
                      className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] cursor-pointer"
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {(debouncedQuery.trim() || filterStatus !== 'all' || filterLocationId !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setFilterStatus('all')
                      setFilterLocationId('all')
                      setPage(1)
                    }}
                    className="text-xs text-[#2E6EF3] hover:text-[#1f5ad2] font-medium transition-colors shrink-0"
                  >
                    {t('common.clear_filters')}
                  </button>
                )}
              </div>
            </>
          }
        />

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 flex items-center justify-center">
            <LoadingSpinner message={t('admin.flow.loading')} />
          </div>
        ) : appointments.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">{t('common.no_results')}</h3>
            <p className="text-slate-500 text-sm">{t('flow.empty_message')}</p>
          </div>
        ) : displayMode === 'kanban' ? (
          <FlowboardKanban
            appointments={filteredAppointments}
            filterStatus={filterStatus}
            formatDate={formatDate}
            formatTime={formatTime}
            formatDob={formatDob}
            accentTheme="purple"
            readonlyHint={t('flow.kanban_readonly_hint')}
            notStartedLabel={t('flow.not_started')}
            unknownPatientLabel={t('flow.unknown_patient')}
            viewLabel={t('common.view')}
            onCardClick={openAppointment}
            onViewClick={(appointment, e) => {
              e.stopPropagation()
              openAppointment(appointment)
            }}
          />
        ) : (
          <div className="space-y-2">
            {paginatedAppointments.map((appointment) => (
              <div
                key={appointment.id}
                onClick={() => openAppointment(appointment)}
                className="flex rounded-2xl overflow-hidden border border-slate-200 bg-white hover:border-[#2E6EF3]/40 hover:shadow-[0_8px_24px_rgba(30,64,175,0.06)] transition-all cursor-pointer"
              >
                <div
                  className={`w-1.5 flex-shrink-0 self-stretch ${getStatusAccentBarClass(appointment.encounter_status)}`}
                  title={translateEncounterStatus(t, appointment.encounter_status)}
                  aria-hidden
                />
                <div className="flex flex-1 flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 min-w-0">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 bg-[#2E6EF3] rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-400 mb-0.5">
                          {t('common.dob')}: {formatDob(appointment.patient?.date_of_birth) ?? t('common.em_dash')}
                        </p>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {appointment.patient
                            ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                            : t('flow.unknown_patient')}
                        </h3>
                        {appointment.patient?.email && (
                          <p className="text-[11px] text-slate-500">{appointment.patient.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
                      <div className="flex items-center gap-2 text-slate-500">
                        <span>{formatDate(appointment.appointment_date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <span>{appointment.appointment_time ? appointment.appointment_time.slice(0, 5) : '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 font-medium">
                        <span className="truncate">
                          {flowboardServiceTitle(appointment, language, appointment.location_tenant_id) ||
                            t('common.em_dash')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <span>{appointment.patient?.phone || '—'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {appointment.encounter_status && (
                      <div className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-slate-50 text-slate-700 border-slate-200">
                        {translateEncounterStatus(t, appointment.encounter_status) || appointment.encounter_status}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (appointment.encounter_id) {
                          setSelectedEncounter({
                            encounterId: appointment.encounter_id,
                            appointmentId: appointment.id,
                            patientId: appointment.patient_id,
                            encounterStatus: appointment.encounter_status,
                          })
                        } else {
                          router.push(`/admin/patient-file/${appointment.patient_id}`)
                        }
                      }}
                      className="px-3 py-1.5 bg-[#2E6EF3] text-white rounded-lg text-[11px] font-semibold hover:bg-[#1f5ad2] transition-colors shrink-0"
                    >
                      {t('common.view')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && displayMode === 'list' && appointments.length > 0 && filteredAppointments.length > 0 && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
            >
              {t('common.previous')}
            </button>
            <span className="text-slate-500 text-sm font-medium">
              {t('common.page_x_of_y', { page, total: totalPages })}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
            >
              {t('common.next')}
            </button>
          </div>
        )}

        {selectedEncounter && (
          <EncounterDetailModal
            encounterId={selectedEncounter.encounterId}
            appointmentId={selectedEncounter.appointmentId}
            patientId={selectedEncounter.patientId}
            isOpen={!!selectedEncounter}
            onClose={() => setSelectedEncounter(null)}
          />
        )}
      </div>
    </div>
  )
}
