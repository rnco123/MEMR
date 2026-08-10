'use client'

import { useAuth } from '@/lib/auth-context'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { FULL_CLINICAL_DASHBOARD_ROLES, UserRole } from '@/lib/roles'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EncounterDetailModal } from '@/components/EncounterDetailModal'
import { SmartPatientSearchInput } from '@/components/SmartPatientSearchInput'
import { AppointmentDateRangeFilter } from '@/components/AppointmentDateRangeFilter'
import {
  FlowboardFilterField,
  FlowboardFilterToolbar,
  FLOWBOARD_SELECT_CLASS,
} from '@/components/FlowboardFilterToolbar'
import { appointmentMatchesParsedPatientSearch } from '@/lib/flowboard/appointment-search-filter'
import { usePatientSearchParse } from '@/lib/hooks/use-patient-search-parse'
import {
  formatClinicDateOnly,
  formatClinicTimeSlot,
  getClinicTodayDateString,
} from '@/lib/datetime/clinic-timezone'
import { useT } from '@/lib/i18n'
import { useUserLocations } from '@/lib/hooks/use-user-locations'
import { LocationFilterSelect } from '@/components/LocationFilterSelect'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { NurseAddEncounterModal } from '@/components/NurseAddEncounterModal'
import { PatientSourceBadge } from '@/components/PatientSourceBadge'
import { formatDobShort } from '@/lib/datetime/date-input'
import { translateEncounterStatus } from '@/lib/encounter-status-i18n'
import { getStatusInfo, type EncounterStatus } from '@/lib/encounter-status'
import { compareActivityDesc } from '@/lib/flowboard/activity-sort'

type AppointmentRow = {
  id: number
  patient_id: number
  appointment_date: string | null
  appointment_time: string | null
  onsite_type: string
  encounter_status?: string | null
  encounter_id?: number | null
  location_id?: number | null
  location_title?: string | null
  created_at?: string
  activity_at?: string
  patient?: {
    id: number
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    date_of_birth: string | null
    created_by_source?: string | null
  } | null
}

const CACHE_KEY = 'future_appointments_list'
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function FutureAppointmentsPageInner() {
  const { user, role } = useAuth()
  const { t, language } = useT()
  const {
    locations: userLocations,
    unrestricted: locationsUnrestricted,
    selectedLocationId,
    setSelectedLocationId,
  } = useUserLocations()

  const [appointments, setAppointments] = useState<AppointmentRow[]>(() => {
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
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { parsed: parsedSearch, isPending: searchPending, debouncedQuery } =
    usePatientSearchParse(searchQuery)
  const [appointmentFrom, setAppointmentFrom] = useState('')
  const [appointmentTo, setAppointmentTo] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)
  const [showAddVisitModal, setShowAddVisitModal] = useState(false)
  const [selectedEncounter, setSelectedEncounter] = useState<{
    encounterId: number
    appointmentId: number
    patientId: number
    encounterStatus?: string
  } | null>(null)
  const [movingAppointmentId, setMovingAppointmentId] = useState<number | null>(null)
  const [pendingMove, setPendingMove] = useState<{
    appointmentId: number
    patientName?: string
  } | null>(null)
  const initialLoadDone = useRef(false)

  const fetchAppointments = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) setLoading(true)
        else setIsRefreshing(true)

        const params = new URLSearchParams({ scope: 'future' })
        if (role === UserRole.NURSE) params.set('mode', 'nurse')
        else if (role === UserRole.ADMIN) params.set('mode', 'admin')
        else params.set('mode', 'doctor')

        if (selectedLocationId !== 'all') {
          params.set('location_id', String(selectedLocationId))
        }

        const res = await fetch(`/api/clinical/flowboard?${params}`, { credentials: 'include' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setAppointments([])
          return
        }

        const rows = (json.data ?? []) as AppointmentRow[]
        setAppointments(rows)
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(rows))
        } catch {
          // ignore
        }
      } catch {
        setAppointments([])
      } finally {
        setLoading(false)
        setIsRefreshing(false)
      }
    },
    [role, selectedLocationId]
  )

  useEffect(() => {
    if (!user || !role) return
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      const hasCache = typeof window !== 'undefined' && !!sessionStorage.getItem(CACHE_KEY)
      void fetchAppointments(!hasCache)
      return
    }
    void fetchAppointments(false)
  }, [user, role, selectedLocationId, fetchAppointments])

  const handleRefresh = () => {
    try {
      sessionStorage.removeItem(CACHE_KEY)
    } catch {
      // ignore
    }
    void fetchAppointments(true)
  }

  const filteredAppointments = useMemo(() => {
    let result = [...appointments]

    const activeParsed =
      parsedSearch && parsedSearch.raw === debouncedQuery.trim() ? parsedSearch : null
    if (activeParsed) {
      result = result.filter((a) => appointmentMatchesParsedPatientSearch(a, activeParsed))
    }

    if (appointmentFrom) {
      result = result.filter(
        (a) => (a.appointment_date?.trim().slice(0, 10) ?? '') >= appointmentFrom
      )
    }
    if (appointmentTo) {
      result = result.filter(
        (a) => (a.appointment_date?.trim().slice(0, 10) ?? '') <= appointmentTo
      )
    }

    result.sort(compareActivityDesc)
    return result
  }, [appointments, parsedSearch, debouncedQuery, appointmentFrom, appointmentTo])

  const hasActiveFilters = Boolean(
    searchQuery.trim() || appointmentFrom || appointmentTo
  )

  const clearFilters = () => {
    setSearchQuery('')
    setAppointmentFrom('')
    setAppointmentTo('')
    setPage(1)
  }

  const paginatedAppointments = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredAppointments.slice(start, start + pageSize)
  }, [filteredAppointments, page, pageSize])

  const totalPages = Math.ceil(filteredAppointments.length / pageSize) || 1

  const defaultLocationId =
    selectedLocationId !== 'all' ? selectedLocationId : userLocations[0]?.id ?? null

  const todayLabel = useMemo(
    () =>
      formatClinicDateOnly(getClinicTodayDateString(), language, {
        weekday: 'long',
      }),
    [language]
  )

  const executeMoveToFlowboard = async (appointmentId: number) => {
    setMovingAppointmentId(appointmentId)
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/move-to-flowboard`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || json.message || t('appointments.move_failed'))
      }
      toast.success(t('appointments.moved_to_flowboard'))
      setAppointments((prev) => prev.filter((a) => a.id !== appointmentId))
      setPendingMove(null)
      try {
        sessionStorage.removeItem(CACHE_KEY)
      } catch {
        // ignore
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('appointments.move_failed'))
    } finally {
      setMovingAppointmentId(null)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">{t('appointments.title')}</h1>
            <p className="text-slate-500 text-sm">{t('appointments.subtitle')}</p>
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

        <FlowboardFilterToolbar
          search={
            <SmartPatientSearchInput
              size="sm"
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value)
                setPage(1)
              }}
              placeholder={t('appointments.search_placeholder')}
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
              <svg
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          }
          filters={
            <>
              <FlowboardFilterField label={t('appointments.date_range')} dob>
                <AppointmentDateRangeFilter
                  from={appointmentFrom}
                  to={appointmentTo}
                  onFromChange={(value) => {
                    setAppointmentFrom(value)
                    setPage(1)
                  }}
                  onToChange={(value) => {
                    setAppointmentTo(value)
                    setPage(1)
                  }}
                />
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
                  className={FLOWBOARD_SELECT_CLASS}
                />
              </FlowboardFilterField>
            </>
          }
          footer={
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-slate-500">
                {t('appointments.count', { count: filteredAppointments.length })}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-medium text-[#2E6EF3] hover:underline"
                >
                  {t('common.clear_filters')}
                </button>
              )}
            </div>
          }
        />

        {loading ? (
          <div className="py-16 flex justify-center">
            <LoadingSpinner message={t('appointments.loading')} variant="light" />
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
            {t('appointments.empty')}
          </div>
        ) : (
          <div className="mt-6 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">{t('appointments.col_patient')}</th>
                    <th className="px-4 py-3">{t('appointments.col_date')}</th>
                    <th className="px-4 py-3">{t('appointments.col_time')}</th>
                    <th className="px-4 py-3">{t('appointments.col_location')}</th>
                    <th className="px-4 py-3">{t('appointments.col_visit_type')}</th>
                    <th className="px-4 py-3">{t('flow.status')}</th>
                    <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedAppointments.map((appointment) => {
                    const statusKey = (appointment.encounter_status ?? 'appointment_initiated') as EncounterStatus
                    const statusInfo = getStatusInfo(statusKey)
                    const statusClass =
                      statusInfo?.value === 'appointment_initiated'
                        ? 'bg-fuchsia-50 text-fuchsia-900 border border-fuchsia-200'
                        : statusInfo?.value === 'provider_assigned'
                          ? 'bg-blue-50 text-blue-800 border border-blue-200'
                          : statusInfo?.value === 'vitals_assessed'
                            ? 'bg-lime-50 text-lime-900 border border-lime-200'
                            : statusInfo?.value === 'in_consultation'
                              ? 'bg-yellow-50 text-yellow-900 border border-yellow-200'
                              : statusInfo?.value === 'consultation_concluded'
                                ? 'bg-red-50 text-red-800 border border-red-200'
                                : statusInfo?.value === 'final_review'
                                  ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    const canOpen = appointment.encounter_id != null
                    return (
                      <tr
                        key={appointment.id}
                        className={canOpen ? 'hover:bg-blue-50/50 cursor-pointer' : undefined}
                        onClick={() => {
                          if (!canOpen || appointment.encounter_id == null) return
                          setSelectedEncounter({
                            encounterId: appointment.encounter_id,
                            appointmentId: appointment.id,
                            patientId: appointment.patient_id,
                            encounterStatus: appointment.encounter_status ?? undefined,
                          })
                        }}
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 inline-flex items-center gap-2 flex-wrap">
                            <span>
                              {appointment.patient?.first_name} {appointment.patient?.last_name}
                            </span>
                            <PatientSourceBadge source={appointment.patient?.created_by_source} />
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatDobShort(appointment.patient?.date_of_birth) ?? '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatClinicDateOnly(appointment.appointment_date, language, {
                            weekday: 'short',
                          }) || t('common.em_dash')}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatClinicTimeSlot(appointment.appointment_time) || t('common.em_dash')}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {appointment.location_title ?? t('common.em_dash')}
                        </td>
                        <td className="px-4 py-3 text-slate-600 capitalize">
                          {appointment.onsite_type === 'telemedicine'
                            ? t('nurse_walkin.telemedicine')
                            : t('nurse_walkin.onsite')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-semibold ${statusClass}`}>
                            {translateEncounterStatus(t, statusKey)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={movingAppointmentId === appointment.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              const patientName =
                                `${appointment.patient?.first_name ?? ''} ${appointment.patient?.last_name ?? ''}`.trim()
                              setPendingMove({
                                appointmentId: appointment.id,
                                patientName: patientName || undefined,
                              })
                            }}
                            className="inline-flex min-h-9 items-center whitespace-nowrap rounded-lg border border-[#2E6EF3]/30 bg-[#2E6EF3]/5 px-3 py-1.5 text-xs font-semibold text-[#2E6EF3] hover:bg-[#2E6EF3]/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {movingAppointmentId === appointment.id
                              ? t('common.saving')
                              : t('appointments.move_to_flowboard')}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span>{t('flow.per_page')}</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setPage(1)
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm disabled:opacity-40"
                  >
                    {t('common.previous')}
                  </button>
                  <span className="text-sm text-slate-600">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm disabled:opacity-40"
                  >
                    {t('common.next')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedEncounter && (
        <EncounterDetailModal
          encounterId={selectedEncounter.encounterId}
          appointmentId={selectedEncounter.appointmentId}
          patientId={selectedEncounter.patientId}
          isOpen
          onClose={() => setSelectedEncounter(null)}
          onEncounterStatusChange={() => void fetchAppointments(false)}
        />
      )}

      <ConfirmDialog
        open={pendingMove != null}
        onClose={() => {
          if (movingAppointmentId == null) setPendingMove(null)
        }}
        onConfirm={async () => {
          if (pendingMove) await executeMoveToFlowboard(pendingMove.appointmentId)
        }}
        title={t('appointments.move_to_flowboard')}
        message={t('appointments.move_to_flowboard_confirm', {
          date: todayLabel || getClinicTodayDateString(),
        })}
        confirmLabel={t('appointments.move_to_flowboard')}
        loading={movingAppointmentId != null}
        accent="blue"
      />

      {role === UserRole.NURSE && (
        <NurseAddEncounterModal
          isOpen={showAddVisitModal}
          onClose={() => setShowAddVisitModal(false)}
          defaultLocationId={defaultLocationId}
          onCreated={() => {
            setShowAddVisitModal(false)
            void fetchAppointments(false)
          }}
        />
      )}
    </div>
  )
}

export default withRoleProtection(FutureAppointmentsPageInner, {
  allowedRoles: [...FULL_CLINICAL_DASHBOARD_ROLES],
})
