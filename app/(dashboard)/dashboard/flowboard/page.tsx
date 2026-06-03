'use client'

import { useAuth } from '@/lib/auth-context'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  getStatusInfo,
  type EncounterStatus,
  ENCOUNTER_STATUSES,
  canJoinTelemedicine,
  getStatusAccentBarClass,
} from '@/lib/encounter-status'
import { EncounterDetailModal } from '@/components/EncounterDetailModal'
import { FlowboardKanban } from '@/components/FlowboardKanban'
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
import { UserRole } from '@/lib/roles'
import { useT } from '@/lib/i18n'
import { useUserLocations } from '@/lib/hooks/use-user-locations'
import { LocationFilterSelect } from '@/components/LocationFilterSelect'

const CACHE_KEY = 'flowboard_appointments'
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function formatDob(dateString: string | null | undefined): string | null {
  if (!dateString) return null
  const d = new Date(dateString + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

function parseAppointmentDateTime(date: string | null, time: string | null): Date | null {
  if (!date) return null
  const normalizedTime = time && time.trim() ? time : '00:00:00'
  const dt = new Date(`${date}T${normalizedTime}`)
  return Number.isNaN(dt.getTime()) ? null : dt
}

interface Appointment {
  id: number
  patient_id: number
  appointment_date: string | null
  appointment_time: string | null
  onsite_type: string
  status?: string | null
  notes?: string | null
  created_at: string
  encounter_status?: string
  encounter_id?: number
  location_id?: number | null
  location_title?: string | null
  patient?: {
    id: number
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    date_of_birth: string | null
  }
}

function FlowboardPage() {
  const { user, role } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { t } = useT()
  const {
    locations: userLocations,
    unrestricted: locationsUnrestricted,
    selectedLocationId,
    setSelectedLocationId,
  } = useUserLocations()
  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const cached = sessionStorage.getItem(CACHE_KEY)
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true
    return !sessionStorage.getItem(CACHE_KEY)
  })
  const viewMode: 'mine' = 'mine'
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'time' | 'name' | 'treatment'>('time')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedEncounter, setSelectedEncounter] = useState<{
    encounterId: number
    appointmentId: number
    patientId: number
    encounterStatus?: string
  } | null>(null)
  const [displayMode, setDisplayMode] = useState<FlowboardDisplayMode>('list')
  const initialLoadDone = useRef(false)

  useEffect(() => {
    setDisplayMode(readFlowboardDisplayMode())
  }, [])

  const handleDisplayModeChange = (mode: FlowboardDisplayMode) => {
    setDisplayMode(mode)
    writeFlowboardDisplayMode(mode)
    setPage(1)
  }

  const openEncounter = useCallback(
    async (appointment: Appointment, e?: React.MouseEvent) => {
      e?.stopPropagation()
      if (appointment.encounter_id) {
        setSelectedEncounter({
          encounterId: appointment.encounter_id,
          appointmentId: appointment.id,
          patientId: appointment.patient_id,
          encounterStatus: appointment.encounter_status,
        })
        return
      }
      const { data: encounter } = await supabase
        .from('encounters')
        .select('id, status')
        .eq('appointment_id', appointment.id)
        .maybeSingle()
      if (encounter?.id) {
        setSelectedEncounter({
          encounterId: encounter.id,
          appointmentId: appointment.id,
          patientId: appointment.patient_id,
          encounterStatus: encounter.status ?? undefined,
        })
      } else {
        alert('You are not assigned to this patient.')
      }
    },
    [supabase]
  )

  const fetchAssignedAppointments = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      else setIsRefreshing(true)

      const params = new URLSearchParams({ mode: 'doctor' })
      if (selectedLocationId !== 'all') {
        params.set('location_id', String(selectedLocationId))
      }
      const res = await fetch(`/api/clinical/flowboard?${params}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        console.error('[Flowboard] Error fetching appointments:', json)
        setAppointments([])
        return
      }

      const appointmentsWithDetails = (json.data ?? []) as Appointment[]
      setAppointments(appointmentsWithDetails)
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(appointmentsWithDetails))
      } catch {
        // ignore storage errors
      }
    } catch (error) {
      console.error('Error in fetchAssignedAppointments:', error)
      if (showLoading) setAppointments([])
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedLocationId])

  useEffect(() => {
    if (user && role === 'doctor' && !initialLoadDone.current) {
      initialLoadDone.current = true
      const hasCache = typeof window !== 'undefined' && !!sessionStorage.getItem(CACHE_KEY)
      fetchAssignedAppointments(!hasCache)
    }
  }, [user, role, fetchAssignedAppointments])

  useEffect(() => {
    if (user && role === 'doctor' && initialLoadDone.current) {
      fetchAssignedAppointments(false)
    }
  }, [selectedLocationId, user, role, fetchAssignedAppointments])

  const refreshData = useCallback(() => {
    try {
      sessionStorage.removeItem(CACHE_KEY)
    } catch {
      // ignore
    }
    fetchAssignedAppointments(true)
    setPage(1)
  }, [fetchAssignedAppointments])


  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('common.em_dash')
    const date = new Date(`${dateString}T00:00:00`)
    if (Number.isNaN(date.getTime())) return t('common.em_dash')
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatTime = (timeString: string | null) => {
    if (!timeString) return t('common.em_dash')
    // Handle time format (HH:MM:SS or HH:MM)
    const time = timeString.split(':')
    if (time.length < 2 || !time[0] || !time[1]) return t('common.em_dash')
    const hours = parseInt(time[0])
    const minutes = time[1]
    if (Number.isNaN(hours)) return t('common.em_dash')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes} ${ampm}`
  }

  // Filter and sort appointments (search/filter on ALL records)
  const filteredAppointments = useMemo(() => {
    let result = [...appointments]

    // Search filter - by patient ID, name, email, phone (null-safe)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(
        (appointment) =>
          appointment.patient_id.toString().includes(query) ||
          (appointment.patient?.first_name ?? '').toLowerCase().includes(query) ||
          (appointment.patient?.last_name ?? '').toLowerCase().includes(query) ||
          (appointment.patient?.email ?? '').toLowerCase().includes(query) ||
          (appointment.patient?.phone ?? '').includes(query)
      )
    }

    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter(appointment => appointment.encounter_status === filterStatus)
    }

    // Sort (copy then sort so we return a new array and React updates the list)
    switch (sortBy) {
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
        result = [...result].sort((a, b) => (a.onsite_type || '').localeCompare(b.onsite_type || ''))
        break
    }

    return result
  }, [appointments, searchQuery, filterStatus, sortBy])

  // Paginate filtered results
  const paginatedAppointments = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredAppointments.slice(start, start + pageSize)
  }, [filteredAppointments, page, pageSize])

  const totalPages = Math.ceil(filteredAppointments.length / pageSize) || 1

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">{t('flow.title')}</h1>
            <p className="text-slate-500 text-sm">{t('flow.subtitle_assigned')}</p>
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

        {/* Search and Filters */}
        <FlowboardFilterToolbar
          search={
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                placeholder={t('flow.search_placeholder')}
                className="w-full pl-10 pr-4 h-11 bg-[#f9fbff] border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] focus:border-transparent"
              />
            </div>
          }
          searchActions={
            <button
              type="button"
              onClick={refreshData}
              disabled={loading || isRefreshing}
              className="h-11 w-11 shrink-0 inline-flex items-center justify-center self-end sm:self-auto bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title={t('common.refresh')}
            >
              <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          }
          filters={
            <>
              <FlowboardFilterField label={t('flow.sort')}>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as 'time' | 'name' | 'treatment')
                    setPage(1)
                  }}
                  className={FLOWBOARD_SELECT_CLASS}
                >
                  <option value="time">{t('flow.sort_time')}</option>
                  <option value="name">{t('flow.sort_name')}</option>
                  <option value="treatment">{t('flow.sort_treatment')}</option>
                </select>
              </FlowboardFilterField>
              <FlowboardFilterField label={t('flow.view')}>
                <select
                  value="mine"
                  onChange={() => {}}
                  disabled
                  className={`${FLOWBOARD_SELECT_CLASS} bg-slate-50 text-slate-500 cursor-not-allowed`}
                >
                  <option value="mine">{t('flow.view_mine')}</option>
                </select>
              </FlowboardFilterField>
              <FlowboardFilterField label={t('location.filter_label')} wide>
                <LocationFilterSelect
                  locations={userLocations}
                  value={selectedLocationId}
                  onChange={(v) => {
                    setSelectedLocationId(v)
                    setPage(1)
                  }}
                  unrestricted={locationsUnrestricted}
                  className={`${FLOWBOARD_SELECT_CLASS} sm:max-w-[16rem]`}
                />
              </FlowboardFilterField>
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
                      {status.label}
                    </option>
                  ))}
                </select>
              </FlowboardFilterField>
              <FlowboardViewToggleSlot>
                <FlowboardViewToggle
                  value={displayMode}
                  onChange={handleDisplayModeChange}
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
                {searchQuery || filterStatus !== 'all' ? ` ${t('flow.filtered_from', { total: appointments.length })}` : ''}
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
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
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

        {/* Appointments List */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 flex items-center justify-center">
            <LoadingSpinner message={t('flow.loading')} />
          </div>
        ) : appointments.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 bg-[#2E6EF3]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {searchQuery || filterStatus !== 'all' ? t('common.no_results') : t('flow.no_active')}
            </h3>
            <p className="text-slate-500 text-sm">
              {searchQuery || filterStatus !== 'all'
                ? t('common.try_adjust_filters')
                : t('flow.no_active_message')}
            </p>
          </div>
        ) : displayMode === 'kanban' ? (
          <FlowboardKanban
            appointments={filteredAppointments}
            filterStatus={filterStatus}
            formatDate={formatDate}
            formatTime={formatTime}
            formatDob={formatDob}
            unknownPatientLabel={t('flow.unknown_patient')}
            viewLabel={t('common.view')}
            readonlyHint={t('flow.kanban_readonly_hint')}
            notStartedLabel={t('flow.not_started')}
            onCardClick={(appointment) => void openEncounter(appointment as Appointment)}
            onViewClick={(appointment, e) => void openEncounter(appointment as Appointment, e)}
          />
        ) : (
          <div className="space-y-3">
            {paginatedAppointments.map((appointment) => (
              <div
                key={appointment.id}
                onClick={() => {
                  if (appointment.encounter_id) {
                    setSelectedEncounter({
                      encounterId: appointment.encounter_id,
                      appointmentId: appointment.id,
                      patientId: appointment.patient_id,
                      encounterStatus: appointment.encounter_status,
                    })
                  }
                }}
                className="flex rounded-2xl overflow-hidden border border-slate-200 bg-white hover:border-[#2E6EF3]/40 hover:shadow-[0_8px_24px_rgba(30,64,175,0.06)] transition-all cursor-pointer"
              >
                <div
                  className={`w-1.5 flex-shrink-0 self-stretch ${getStatusAccentBarClass(appointment.encounter_status)}`}
                  title={getStatusInfo(appointment.encounter_status as EncounterStatus)?.label ?? 'Status'}
                  aria-hidden
                />
                <div className="flex flex-1 flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 min-w-0">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-11 h-11 bg-[#2E6EF3] rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5">
                          {t('common.dob')}: {formatDob(appointment.patient?.date_of_birth) ?? '—'}
                        </p>
                        <h3 className="text-base font-semibold text-slate-900">
                          {appointment.patient
                            ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                            : t('flow.unknown_patient')}
                        </h3>
                        {appointment.patient?.email && (
                          <p className="text-xs text-slate-500">{appointment.patient.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{formatDate(appointment.appointment_date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{formatTime(appointment.appointment_time)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span>{appointment.patient?.phone || t('common.em_dash')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {appointment.encounter_status && (
                      <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                        appointment.encounter_status === 'appointment_initiated' ? 'bg-fuchsia-50 text-fuchsia-900 border-fuchsia-200' :
                        appointment.encounter_status === 'provider_assigned' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                        appointment.encounter_status === 'vitals_assessed' ? 'bg-lime-50 text-lime-900 border-lime-200' :
                        appointment.encounter_status === 'in_consultation' ? 'bg-yellow-50 text-yellow-900 border-yellow-200' :
                        appointment.encounter_status === 'consultation_concluded' ? 'bg-red-50 text-red-800 border-red-200' :
                        appointment.encounter_status === 'final_review' ? 'bg-teal-50 text-teal-800 border-teal-200' :
                        'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        {getStatusInfo(appointment.encounter_status as EncounterStatus)?.label || appointment.encounter_status}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (appointment.encounter_id) {
                          setSelectedEncounter({
                            encounterId: appointment.encounter_id,
                            appointmentId: appointment.id,
                            patientId: appointment.patient_id,
                            encounterStatus: appointment.encounter_status,
                          })
                          return
                        }
                        const { data: encounter } = await supabase
                          .from('encounters')
                          .select('id, status')
                          .eq('appointment_id', appointment.id)
                          .maybeSingle()
                        if (encounter?.id) {
                          setSelectedEncounter({
                            encounterId: encounter.id,
                            appointmentId: appointment.id,
                            patientId: appointment.patient_id,
                            encounterStatus: encounter.status ?? undefined,
                          })
                        } else {
                          alert('You are not assigned to this patient.')
                        }
                      }}
                      className="px-3.5 py-2 bg-[#2E6EF3] text-white rounded-lg text-xs font-semibold hover:bg-[#1f5ad2] transition-colors shrink-0"
                    >
                      {t('common.view')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && displayMode === 'list' && appointments.length > 0 && filteredAppointments.length > 0 && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('common.previous')}
            </button>
            <span className="text-slate-500 text-sm font-medium">
              {t('common.page_x_of_y', { page, total: totalPages })}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
            >
              {t('common.next')}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Encounter Detail Modal */}
      {selectedEncounter && (
        <EncounterDetailModal
          encounterId={selectedEncounter.encounterId}
          appointmentId={selectedEncounter.appointmentId}
          patientId={selectedEncounter.patientId}
          isOpen={!!selectedEncounter}
          onClose={() => setSelectedEncounter(null)}
          onJoinTelemedicine={() => {
            router.push(`/video?encounter=${selectedEncounter.encounterId}`)
          }}
          canJoinTelemedicine={canJoinTelemedicine(selectedEncounter.encounterStatus)}
        />
      )}
    </div>
  )
}

export default withRoleProtection(FlowboardPage, {
  allowedRoles: [UserRole.ADMIN, UserRole.DOCTOR],
  redirectTo: '/dashboard',
})

