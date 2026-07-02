'use client'

import { useAuth } from '@/lib/auth-context'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EncounterDetailModal } from '@/components/EncounterDetailModal'
import {
  canJoinTelemedicine,
  getStatusInfo,
  type EncounterStatus,
  getStatusAccentBarClass,
  ENCOUNTER_STATUSES,
} from '@/lib/encounter-status'
import { translateEncounterStatus } from '@/lib/encounter-status-i18n'
import { VitalsFormModal } from '@/components/VitalsFormModal'
import { AssignProviderModal } from '@/components/AssignProviderModal'
import { BatchAssignProviderModal } from '@/components/BatchAssignProviderModal'
import { FlowboardBatchActionBar } from '@/components/FlowboardBatchActionBar'
import { SmartPatientSearchInput } from '@/components/SmartPatientSearchInput'
import { appointmentMatchesParsedPatientSearch } from '@/lib/flowboard/appointment-search-filter'
import { useAiPatientSearchParse } from '@/lib/hooks/use-ai-patient-search-parse'
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
import { CLINICAL_DASHBOARD_ROLES, isPhysicianRole, UserRole } from '@/lib/roles'
import { formatClinicTimeSlot } from '@/lib/datetime/clinic-timezone'
import { useT } from '@/lib/i18n'
import { useUserLocations } from '@/lib/hooks/use-user-locations'
import { LocationFilterSelect } from '@/components/LocationFilterSelect'
import { NurseAddEncounterModal } from '@/components/NurseAddEncounterModal'
import { formatDobShort } from '@/lib/datetime/date-input'

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
  assigned_doctor?: {
    id: number
    full_name: string
    email: string | null
  }
  patient?: {
    id: number
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    date_of_birth: string | null
  }
}

interface AvailableDoctor {
  id: number
  user_id: string
  full_name: string
  email: string | null
  specialty: string | null
  is_available?: boolean
}

const NURSE_FLOWBOARD_CACHE_KEY = 'nurse_flowboard_appointments'
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function formatDob(dateString: string | null | undefined): string | null {
  return formatDobShort(dateString)
}

function parseAppointmentDateTime(date: string | null, time: string | null): Date | null {
  if (!date) return null
  const normalizedTime = time && time.trim() ? time : '00:00:00'
  const dt = new Date(`${date}T${normalizedTime}`)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function NurseFlowboardPage() {
  const { user, role } = useAuth()
  const router = useRouter()
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
      const cached = sessionStorage.getItem(NURSE_FLOWBOARD_CACHE_KEY)
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [availableDoctors, setAvailableDoctors] = useState<AvailableDoctor[]>([])
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true
    return !sessionStorage.getItem(NURSE_FLOWBOARD_CACHE_KEY)
  })
  const [assigningDoctor, setAssigningDoctor] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { parsed: parsedSearch, isPending: searchPending, debouncedQuery } =
    useAiPatientSearchParse(searchQuery, { includeProvider: true })
  const [sortBy, setSortBy] = useState<'time' | 'name' | 'treatment'>('time')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)
  const [selectedEncounter, setSelectedEncounter] = useState<{
    encounterId: number
    appointmentId: number
    patientId: number
    encounterStatus?: string
  } | null>(null)
  const [showAssignModal, setShowAssignModal] = useState<{ appointmentId: number; appointment: Appointment } | null>(null)
  const [showVitalsModal, setShowVitalsModal] = useState<number | null>(null)
  const [showAddVisitModal, setShowAddVisitModal] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [displayMode, setDisplayMode] = useState<FlowboardDisplayMode>('list')
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState<Set<number>>(new Set())
  const [showBatchAssignModal, setShowBatchAssignModal] = useState(false)
  const [batchAssigning, setBatchAssigning] = useState(false)
  const initialLoadDone = useRef(false)

  useEffect(() => {
    if (isPhysicianRole(role)) {
      router.replace('/dashboard/flowboard')
    }
  }, [role, router])

  useEffect(() => {
    setDisplayMode(readFlowboardDisplayMode())
  }, [])

  const handleDisplayModeChange = (mode: FlowboardDisplayMode) => {
    setDisplayMode(mode)
    writeFlowboardDisplayMode(mode)
    setPage(1)
  }

  const fetchAvailableDoctors = useCallback(async () => {
    try {
      const res = await fetch('/api/doctors', { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Error fetching doctors:', json)
        setAvailableDoctors([])
        return
      }
      setAvailableDoctors((json.data ?? []) as AvailableDoctor[])
    } catch (error) {
      console.error('Error in fetchAvailableDoctors:', error)
      setAvailableDoctors([])
    }
  }, [])

  const fetchAllAppointments = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      else setIsRefreshing(true)

      const params = new URLSearchParams({ mode: 'nurse' })
      if (selectedLocationId !== 'all') {
        params.set('location_id', String(selectedLocationId))
      }
      const res = await fetch(`/api/clinical/flowboard?${params}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Error fetching flowboard:', json)
        setAppointments([])
        return
      }

      const appointmentsWithDetails = (json.data ?? []) as Appointment[]
      setAppointments(appointmentsWithDetails)
      try {
        sessionStorage.setItem(NURSE_FLOWBOARD_CACHE_KEY, JSON.stringify(appointmentsWithDetails))
      } catch {
        // ignore storage errors
      }
    } catch (error) {
      console.error('Error in fetchAllAppointments:', error)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedLocationId])

  useEffect(() => {
    if (user && role === UserRole.NURSE && !initialLoadDone.current) {
      initialLoadDone.current = true
      const hasCache =
        typeof window !== 'undefined' && !!sessionStorage.getItem(NURSE_FLOWBOARD_CACHE_KEY)
      fetchAllAppointments(!hasCache)
      fetchAvailableDoctors()
    }
  }, [user, role, fetchAllAppointments, fetchAvailableDoctors])

  useEffect(() => {
    if (user && role === UserRole.NURSE && initialLoadDone.current) {
      fetchAllAppointments(false)
    }
  }, [selectedLocationId, user, role, fetchAllAppointments])

  const handleRefresh = () => {
    try {
      sessionStorage.removeItem(NURSE_FLOWBOARD_CACHE_KEY)
    } catch {
      // ignore
    }
    fetchAllAppointments(true)
    fetchAvailableDoctors()
  }

  const filteredAppointments = useMemo(() => {
    let result = [...appointments]

    const activeParsed =
      parsedSearch && parsedSearch.raw === debouncedQuery.trim() ? parsedSearch : null
    if (activeParsed) {
      result = result.filter((a) =>
        appointmentMatchesParsedPatientSearch(a, activeParsed, { includeProvider: true })
      )
    }

    // Encounter status filter (no encounter yet counts as appointment_initiated)
    if (filterStatus !== 'all') {
      result = result.filter((a) => {
        if (filterStatus === 'appointment_initiated') {
          return !a.encounter_status || a.encounter_status === 'appointment_initiated'
        }
        return a.encounter_status === filterStatus
      })
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
  }, [appointments, parsedSearch, debouncedQuery, sortBy, filterStatus])

  // Paginate filtered results
  const paginatedAppointments = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredAppointments.slice(start, start + pageSize)
  }, [filteredAppointments, page, pageSize])

  const totalPages = Math.ceil(filteredAppointments.length / pageSize) || 1

  const isAppointmentAssignable = useCallback((appointment: Appointment) => {
    return !appointment.assigned_doctor && availableDoctors.length > 0
  }, [availableDoctors.length])

  const selectableOnPage = useMemo(
    () => paginatedAppointments.filter(isAppointmentAssignable),
    [paginatedAppointments, isAppointmentAssignable]
  )

  const toggleAppointmentSelection = useCallback((appointmentId: number, checked: boolean) => {
    setSelectedAppointmentIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(appointmentId)
      else next.delete(appointmentId)
      return next
    })
  }, [])

  const selectAllAssignableOnPage = useCallback(() => {
    setSelectedAppointmentIds(new Set(selectableOnPage.map((a) => a.id)))
  }, [selectableOnPage])

  const clearAppointmentSelection = useCallback(() => {
    setSelectedAppointmentIds(new Set())
  }, [])

  const batchAssignProvider = async (doctorId: string, appointmentDate: string, appointmentTime: string) => {
    const ids = [...selectedAppointmentIds]
    if (ids.length === 0 || batchAssigning) return

    setBatchAssigning(true)
    try {
      const res = await fetch('/api/nurse/batch-assign-provider', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_ids: ids,
          doctor_id: Number(doctorId),
          appointment_date: appointmentDate || null,
          appointment_time: appointmentTime || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Failed to assign provider')
      }
      if (json.failed > 0) {
        alert(
          t('flow.batch_assign_result', {
            assigned: json.assigned ?? 0,
            failed: json.failed ?? 0,
          })
        )
      }
      setShowBatchAssignModal(false)
      clearAppointmentSelection()
      await fetchAllAppointments()
      await fetchAvailableDoctors()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to assign provider')
    } finally {
      setBatchAssigning(false)
    }
  }

  const assignDoctorToAppointment = async (appointmentId: number, doctorId: string, appointmentDate?: string, appointmentTime?: string) => {
    setAssigningDoctor(appointmentId.toString())
    try {
      const doctorIdNum = parseInt(doctorId)
      if (isNaN(doctorIdNum)) {
        alert('Invalid doctor ID')
        return
      }

      const res = await fetch('/api/nurse/batch-assign-provider', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_ids: [appointmentId],
          doctor_id: doctorIdNum,
          appointment_date: appointmentDate ?? null,
          appointment_time: appointmentTime ?? null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Failed to assign provider')
      }
      if (json.failed > 0) {
        const firstError = json.results?.find((r: { success?: boolean; error?: string }) => !r.success)
        alert(firstError?.error || 'Failed to assign doctor. Please try again.')
        return
      }

      await fetchAllAppointments()
      await fetchAvailableDoctors()
    } catch (error) {
      console.error('Error assigning doctor:', error)
      alert(error instanceof Error ? error.message : 'Failed to assign doctor. Please try again.')
    } finally {
      setAssigningDoctor(null)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('common.em_dash')
    const date = new Date(`${dateString}T00:00:00`)
    if (Number.isNaN(date.getTime())) return t('common.em_dash')
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const formatTime = (timeString: string | null) => {
    const formatted = formatClinicTimeSlot(timeString)
    return formatted || t('common.em_dash')
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">{t('flow.title')}</h1>
            <p className="text-slate-500 text-sm">{t('flow.subtitle_nurse')}</p>
          </div>
          {role === UserRole.NURSE && (
            <button
              type="button"
              onClick={() => setShowAddVisitModal(true)}
              className="h-11 px-4 rounded-xl bg-[#2E6EF3] text-white text-sm font-semibold hover:bg-[#1f5ad2] transition-colors shrink-0"
            >
              + {t('flow.add_encounter')}
            </button>
          )}
        </div>

        {/* Stats Cards - Only for Nurse */}
        {role === 'nurse' && !loading && appointments.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('flow.stat_total')}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{appointments.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('flow.stat_assigned')}</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {appointments.filter(a => a.assigned_doctor).length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('flow.stat_unassigned')}</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">
                {appointments.filter(a => !a.assigned_doctor).length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('flow.stat_available')}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{availableDoctors.length}</p>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <FlowboardFilterToolbar
          search={
            <SmartPatientSearchInput
              size="sm"
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value)
                setPage(1)
              }}
              placeholder={t('flow.search_placeholder_nurse')}
              loading={searchPending}
            />
          }
          searchActions={
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading || isRefreshing}
              className="h-9 w-9 shrink-0 inline-flex items-center justify-center self-end sm:self-auto bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title={t('common.refresh')}
            >
              <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          }
          filters={
            <>
              <FlowboardFilterField label={t('location.filter_label')} wide>
                <LocationFilterSelect
                  locations={userLocations}
                  value={selectedLocationId}
                  onChange={(v) => {
                    setSelectedLocationId(v)
                    setPage(1)
                  }}
                  unrestricted={locationsUnrestricted}
                  className={FLOWBOARD_SELECT_CLASS}
                />
              </FlowboardFilterField>
              <FlowboardFilterField label={t('flow.sort')}>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as typeof sortBy)
                    setPage(1)
                  }}
                  className={FLOWBOARD_SELECT_CLASS}
                >
                  <option value="time">{t('flow.sort_time')}</option>
                  <option value="name">{t('flow.sort_name')}</option>
                  <option value="treatment">{t('flow.sort_treatment')}</option>
                </select>
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
                      {translateEncounterStatus(t, status.value)}
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
                {debouncedQuery.trim() || filterStatus !== 'all'
                  ? ` ${t('flow.filtered_from', { total: appointments.length })}`
                  : ''}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {availableDoctors.length > 0 && (
                  <p className="text-xs text-emerald-600 font-medium shrink-0">
                    {t('flow.providers_available', { count: availableDoctors.length })}
                  </p>
                )}
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
                {(debouncedQuery.trim() || filterStatus !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setFilterStatus('all')
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

        {/* Appointments Table */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 flex items-center justify-center">
            <LoadingSpinner message={t('flow.loading')} />
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 bg-[#2E6EF3]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {debouncedQuery.trim() || filterStatus !== 'all' ? t('common.no_results') : t('flow.no_appointments')}
            </h3>
            <p className="text-slate-500 text-sm">
              {debouncedQuery.trim() || filterStatus !== 'all'
                ? t('common.try_adjust_filters')
                : t('flow.empty_message')}
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
            pendingEncounterLabel={t('flow.awaiting_encounter')}
            onCardClick={(appointment) => {
              if (appointment.encounter_id) {
                setSelectedEncounter({
                  encounterId: appointment.encounter_id,
                  appointmentId: appointment.id,
                  patientId: appointment.patient_id,
                  encounterStatus: appointment.encounter_status ?? undefined,
                })
              }
            }}
            onViewClick={(appointment, e) => {
              e.stopPropagation()
              if (appointment.encounter_id) {
                setSelectedEncounter({
                  encounterId: appointment.encounter_id,
                  appointmentId: appointment.id,
                  patientId: appointment.patient_id,
                  encounterStatus: appointment.encounter_status ?? undefined,
                })
              }
            }}
            renderCardFooter={(appointment) => (
              <>
                {!appointment.assigned_doctor && availableDoctors.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowAssignModal({
                        appointmentId: appointment.id,
                        appointment: appointment as Appointment,
                      })
                    }}
                    disabled={assigningDoctor === appointment.id.toString()}
                    className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {t('flow.assign_provider')}
                  </button>
                )}
                {appointment.assigned_doctor &&
                  appointment.encounter_id &&
                  (!appointment.encounter_status ||
                    appointment.encounter_status === 'provider_assigned') && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowVitalsModal(appointment.encounter_id!)
                    }}
                    className="px-2 py-1 bg-purple-600 text-white rounded-lg text-[10px] font-semibold hover:bg-purple-700 transition-colors"
                  >
                    {t('flow.vitals')}
                  </button>
                )}
              </>
            )}
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {displayMode === 'list' && (
              <div className="px-6 pt-4">
                <FlowboardBatchActionBar
                  selectedCount={selectedAppointmentIds.size}
                  totalSelectableOnPage={selectableOnPage.length}
                  onSelectAllPage={selectAllAssignableOnPage}
                  onClear={clearAppointmentSelection}
                  actionLabel={t('flow.batch_assign_provider')}
                  actionLoadingLabel={t('flow.batch_assigning')}
                  isLoading={batchAssigning}
                  onAction={() => setShowBatchAssignModal(true)}
                  disabled={availableDoctors.length === 0}
                />
              </div>
            )}
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <div className="col-span-3">{t('flow.col_patient')}</div>
              <div className="col-span-2">{t('flow.col_status')}</div>
              <div className="col-span-2">{t('flow.col_appointment')}</div>
              <div className="col-span-2">{t('flow.col_provider')}</div>
              <div className="col-span-3 text-right">{t('common.actions')}</div>
            </div>

            <div className="divide-y divide-slate-100">
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
                  className="flex hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div
                    className={`w-1.5 flex-shrink-0 self-stretch ${getStatusAccentBarClass(appointment.encounter_status)}`}
                    title={
                      appointment.encounter_status
                        ? translateEncounterStatus(t, appointment.encounter_status)
                        : undefined
                    }
                    aria-hidden
                  />
                  <div className="grid flex-1 grid-cols-1 lg:grid-cols-12 gap-4 px-6 py-4 min-w-0">
                  <div className="lg:col-span-3 flex items-center gap-3">
                    {isAppointmentAssignable(appointment) ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-[#2E6EF3] focus:ring-[#2E6EF3]"
                        checked={selectedAppointmentIds.has(appointment.id)}
                        onChange={(e) => toggleAppointmentSelection(appointment.id, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t('flow.batch_select_page')}
                      />
                    ) : (
                      <span className="hidden lg:block w-4 shrink-0" aria-hidden />
                    )}
                    <div className="w-10 h-10 bg-[#2E6EF3] rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 text-sm">
                      {appointment.patient?.first_name?.charAt(0) || '?'}{appointment.patient?.last_name?.charAt(0) || ''}
                    </div>
                    <div className="min-w-0">
                      <p className="text-slate-400 text-xs mb-0.5">
                        {t('common.dob')}: {formatDob(appointment.patient?.date_of_birth) ?? '—'}
                      </p>
                      <h3 className="text-slate-900 font-semibold text-sm truncate">
                        {appointment.patient
                          ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                          : t('flow.unknown_patient')}
                      </h3>
                      <p className="text-slate-400 text-xs font-mono">{t('common.id')}: {appointment.patient_id}</p>
                    </div>
                  </div>

                  <div className="lg:col-span-2 flex items-center">
                    {appointment.encounter_status ? (
                      (() => {
                        const info = getStatusInfo(appointment.encounter_status as EncounterStatus)
                        const baseColor =
                          info?.value === 'appointment_initiated'
                            ? 'bg-fuchsia-50 text-fuchsia-900 border border-fuchsia-200'
                            : info?.value === 'provider_assigned'
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : info?.value === 'vitals_assessed'
                            ? 'bg-lime-50 text-lime-900 border border-lime-200'
                            : info?.value === 'in_consultation'
                            ? 'bg-yellow-50 text-yellow-900 border border-yellow-200'
                            : info?.value === 'consultation_concluded'
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : info?.value === 'final_review'
                            ? 'bg-teal-50 text-teal-800 border border-teal-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'

                        return (
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${baseColor}`}>
                            {translateEncounterStatus(t, appointment.encounter_status) || appointment.encounter_status}
                          </span>
                        )
                      })()
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-900 border border-purple-200">
                        {t('flow.not_started')}
                      </span>
                    )}
                  </div>

                  <div className="lg:col-span-2 flex flex-col justify-center">
                    <p className="text-slate-700 text-sm">{formatDate(appointment.appointment_date)}</p>
                    <p className="text-slate-500 text-xs">{formatTime(appointment.appointment_time)}</p>
                  </div>

                  <div className="lg:col-span-2 flex items-center">
                    {appointment.assigned_doctor ? (
                      <div>
                        <p className="text-slate-700 text-sm">{appointment.assigned_doctor.full_name}</p>
                        <span className="text-xs text-emerald-600 font-medium">{t('common.assigned')}</span>
                      </div>
                    ) : (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold">
                        {t('common.unassigned')}
                      </span>
                    )}
                  </div>

                  <div className="lg:col-span-3 flex items-center justify-end gap-2 flex-wrap">
                    {appointment.encounter_id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedEncounter({
                            encounterId: appointment.encounter_id!,
                            appointmentId: appointment.id,
                            patientId: appointment.patient_id,
                            encounterStatus: appointment.encounter_status,
                          })
                        }}
                        className="px-3 py-1.5 bg-[#2E6EF3] text-white rounded-lg text-xs font-semibold hover:bg-[#1f5ad2] transition-colors"
                      >
                        {t('common.view')}
                      </button>
                    )}
                    {!appointment.assigned_doctor && availableDoctors.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowAssignModal({ appointmentId: appointment.id, appointment })
                        }}
                        disabled={assigningDoctor === appointment.id.toString()}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        {t('flow.assign_provider')}
                      </button>
                    )}
                    {appointment.assigned_doctor && appointment.encounter_status === 'provider_assigned' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowAssignModal({ appointmentId: appointment.id, appointment })
                        }}
                        disabled={assigningDoctor === appointment.id.toString()}
                        className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
                      >
                        {t('common.edit')}
                      </button>
                    )}
                    {appointment.assigned_doctor &&
                      appointment.encounter_id &&
                      (!appointment.encounter_status ||
                        appointment.encounter_status === 'provider_assigned') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowVitalsModal(appointment.encounter_id!)
                        }}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 transition-colors"
                      >
                        {t('flow.vitals')}
                      </button>
                    )}
                    {availableDoctors.length === 0 && !appointment.assigned_doctor && (
                      <span className="text-red-500 text-xs font-medium">{t('flow.no_providers')}</span>
                    )}
                  </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pagination below table */}
        {!loading && displayMode === 'list' && filteredAppointments.length > 0 && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
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
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

      {/* Vitals Form Modal */}
      {showVitalsModal && (
        <VitalsFormModal
          encounterId={showVitalsModal}
          isOpen={!!showVitalsModal}
          onClose={() => setShowVitalsModal(null)}
          onSave={() => {
            fetchAllAppointments()
          }}
        />
        )}

        {/* Assign Provider Modal */}
        {showAssignModal && (
        <AssignProviderModal
          appointment={showAssignModal.appointment}
          availableDoctors={availableDoctors}
          assigningDoctor={assigningDoctor}
          onAssign={async (doctorId, appointmentDate, appointmentTime) => {
            await assignDoctorToAppointment(
              showAssignModal.appointmentId,
              doctorId,
              appointmentDate,
              appointmentTime
            )
            setShowAssignModal(null)
          }}
          onClose={() => setShowAssignModal(null)}
        />
        )}

        {showBatchAssignModal && (
          <BatchAssignProviderModal
            appointmentIds={[...selectedAppointmentIds]}
            availableDoctors={availableDoctors}
            isSubmitting={batchAssigning}
            onAssign={(doctorId, appointmentDate, appointmentTime) => {
              void batchAssignProvider(doctorId, appointmentDate, appointmentTime)
            }}
            onClose={() => {
              if (!batchAssigning) setShowBatchAssignModal(false)
            }}
          />
        )}

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
        {role === UserRole.NURSE && (
          <NurseAddEncounterModal
            isOpen={showAddVisitModal}
            onClose={() => setShowAddVisitModal(false)}
            defaultLocationId={selectedLocationId === 'all' ? null : selectedLocationId}
            onCreated={async ({ encounterId, appointmentId, patientId }) => {
              sessionStorage.removeItem(NURSE_FLOWBOARD_CACHE_KEY)
              await fetchAllAppointments(true)
              setSelectedEncounter({
                encounterId,
                appointmentId,
                patientId,
                encounterStatus: 'appointment_initiated',
              })
            }}
          />
        )}
    </div>
  )
}

export default withRoleProtection(NurseFlowboardPage, {
  allowedRoles: [...CLINICAL_DASHBOARD_ROLES],
  redirectTo: '/dashboard',
})
