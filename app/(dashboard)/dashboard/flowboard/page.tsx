'use client'

import { useAuth } from '@/lib/auth-context'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { getStatusInfo, type EncounterStatus, ENCOUNTER_STATUSES, canJoinTelemedicine } from '@/lib/encounter-status'
import { EncounterDetailModal } from '@/components/EncounterDetailModal'
import { UserRole } from '@/lib/roles'

const CACHE_KEY = 'flowboard_appointments'
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function formatDob(dateString: string | null | undefined): string | null {
  if (!dateString) return null
  const d = new Date(dateString + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
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
  const [viewMode, setViewMode] = useState<'mine' | 'all'>('all')
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
  const initialLoadDone = useRef(false)

  const fetchAssignedAppointments = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      else setIsRefreshing(true)
      
      // Fetch ALL appointments first (not just those with encounters)
      console.log('[Flowboard] Fetching appointments...', { viewMode, userId: user?.id, role })
      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('appointments')
        .select('id, patient_id, appointment_date, appointment_time, onsite_type, created_at')
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true })

      console.log('[Flowboard] Appointments query result:', { 
        data: appointmentsData, 
        error: appointmentsError,
        count: appointmentsData?.length || 0
      })

      if (appointmentsError) {
        console.error('[Flowboard] Error fetching appointments:', appointmentsError)
        setAppointments([])
        setLoading(false)
        setIsRefreshing(false)
        return
      }

      if (!appointmentsData || appointmentsData.length === 0) {
        console.log('[Flowboard] No appointments found in database')
        setAppointments([])
        setLoading(false)
        setIsRefreshing(false)
        return
      }

      // Fetch patient details
      const patientIds = [...new Set(appointmentsData.map(a => a.patient_id).filter(Boolean))]
      const { data: patientsData, error: patientsError } = await supabase
        .from('patients')
        .select('id, first_name, last_name, email, phone, date_of_birth')
        .in('id', patientIds)

      if (patientsError) {
        console.error('Error fetching patients:', patientsError)
      }

      // Fetch encounters for these appointments
      const appointmentIds = appointmentsData.map(a => a.id)
      const { data: encountersData, error: encountersError } = await supabase
        .from('encounters')
        .select('id, appointment_id, patient_id, status, doctor_id')
        .in('appointment_id', appointmentIds)

      if (encountersError) {
        console.error('Error fetching encounters:', encountersError)
      }

      // Get doctor ID if filtering by "mine"
      let doctorId: number | null = null
      if (viewMode === 'mine' && user?.id) {
        const { data: doctorData, error: doctorError } = await supabase
          .from('doctors')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (doctorError) {
          console.error('Error fetching doctor record:', doctorError)
        } else if (doctorData) {
          doctorId = doctorData.id
        }
      }

      // Combine data
      const appointmentsWithDetails = appointmentsData
        .map(appointment => {
          const encounter = encountersData?.find(e => e.appointment_id === appointment.id)
          const patient = patientsData?.find(p => p.id === appointment.patient_id)
          
          return {
            ...appointment,
            patient: patient ? {
              id: patient.id,
              first_name: patient.first_name,
              last_name: patient.last_name,
              email: patient.email,
              phone: patient.phone,
              date_of_birth: (patient as { date_of_birth?: string | null }).date_of_birth ?? null,
            } : undefined,
            encounter_status: encounter?.status || null,
            encounter_id: encounter?.id || null,
          }
        })
        // Filter by doctor assignment if "mine" mode
        .filter(appointment => {
          if (viewMode === 'mine' && doctorId !== null) {
            const encounter = encountersData?.find(e => e.appointment_id === appointment.id)
            return encounter?.doctor_id === doctorId
          }
          return true
        })

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
  }, [user, supabase, viewMode])

  useEffect(() => {
    if (user && role === 'doctor' && !initialLoadDone.current) {
      initialLoadDone.current = true
      const hasCache = typeof window !== 'undefined' && !!sessionStorage.getItem(CACHE_KEY)
      fetchAssignedAppointments(!hasCache)
    }
  }, [user, role, fetchAssignedAppointments])

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
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatTime = (timeString: string | null) => {
    if (!timeString) return 'N/A'
    // Handle time format (HH:MM:SS or HH:MM)
    const time = timeString.split(':')
    if (time.length < 2 || !time[0] || !time[1]) return 'N/A'
    const hours = parseInt(time[0])
    const minutes = time[1]
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
          const dateA = a.appointment_date && a.appointment_time ? new Date(`${a.appointment_date}T${a.appointment_time}`) : new Date(0)
          const dateB = b.appointment_date && b.appointment_time ? new Date(`${b.appointment_date}T${b.appointment_time}`) : new Date(0)
          return dateA.getTime() - dateB.getTime()
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
    <div className="p-6 lg:p-12">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Flowboard</h1>
            <p className="text-blue-200 text-lg">
              {viewMode === 'all' ? 'All active encounters' : 'Your assigned active encounters'}
            </p>
          </div>
          <button
            onClick={refreshData}
            disabled={loading || isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRefreshing ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Refreshing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </>
            )}
          </button>
        </div>

        {/* Search and Filters */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                placeholder="Search by patient ID, name, email, or phone..."
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={refreshData}
              disabled={loading || isRefreshing}
              className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white hover:bg-white/20 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <svg className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <span className="text-blue-200 text-sm whitespace-nowrap">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as 'time' | 'name' | 'treatment')
                  setPage(1)
                }}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="time">Appointment Time</option>
                <option value="name">Patient Name</option>
                <option value="treatment">Treatment Type</option>
              </select>
            </div>

            {/* View mode: All encounters vs Assigned to me */}
            <div className="flex items-center gap-2">
              <span className="text-blue-200 text-sm whitespace-nowrap">View:</span>
              <select
                value={viewMode}
                onChange={(e) => {
                  const mode = e.target.value as 'mine' | 'all'
                  setViewMode(mode)
                  setPage(1)
                  try { sessionStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
                  fetchAssignedAppointments(true)
                }}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All encounters</option>
                <option value="mine">Assigned to me</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-blue-200 text-sm whitespace-nowrap">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value)
                  setPage(1)
                }}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All</option>
                {ENCOUNTER_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Results count */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-blue-200">
              Showing <span className="text-white font-medium">
                {filteredAppointments.length === 0 ? 0 : (page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, filteredAppointments.length)}
              </span>
              {' '}of <span className="text-white font-medium">{filteredAppointments.length}</span> appointments
              {searchQuery || filterStatus !== 'all' ? ` (filtered from ${appointments.length})` : ''}
            </p>
            <div className="flex items-center gap-4">
              <label className="text-sm text-blue-200 flex items-center gap-2">
                Per page:
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setPage(1)
                  }}
                  className="text-sm text-blue-300 hover:text-white transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Appointments List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner message="Loading appointments..." />
          </div>
        ) : appointments.length === 0 ? (
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-12 text-center">
            <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              {searchQuery || filterStatus !== 'all' ? 'No Results Found' : 'No Active Encounters'}
            </h3>
            <p className="text-blue-200">
              {searchQuery || filterStatus !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'You don\'t have any active encounters assigned to you at this time.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
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
                className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 hover:bg-white/15 transition-all cursor-pointer"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-blue-300/90 mb-0.5">
                          DOB: {formatDob(appointment.patient?.date_of_birth) ?? '—'}
                        </p>
                        <h3 className="text-xl font-bold text-white">
                          {appointment.patient
                            ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                            : 'Unknown Patient'}
                        </h3>
                        {appointment.patient?.email && (
                          <p className="text-sm text-blue-200">{appointment.patient.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-blue-200">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{appointment.appointment_date ? formatDate(appointment.appointment_date) : 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-blue-200">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{appointment.appointment_time ? formatTime(appointment.appointment_time) : 'N/A'}</span>
                      </div>
                      {appointment.patient?.phone && (
                        <div className="flex items-center gap-2 text-blue-200">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span>{appointment.patient.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {appointment.encounter_status && (
                      <div className={`px-4 py-2 rounded-xl text-white text-sm font-medium ${
                        appointment.encounter_status === 'appointment_initiated' ? 'bg-gray-500/20 border border-gray-500/50' :
                        appointment.encounter_status === 'provider_assigned' ? 'bg-blue-500/20 border border-blue-500/50' :
                        appointment.encounter_status === 'vitals_assessed' ? 'bg-purple-500/20 border border-purple-500/50' :
                        appointment.encounter_status === 'in_consultation' ? 'bg-yellow-500/20 border border-yellow-500/50' :
                        appointment.encounter_status === 'consultation_concluded' ? 'bg-orange-500/20 border border-orange-500/50' :
                        appointment.encounter_status === 'final_review' ? 'bg-cyan-500/20 border border-cyan-500/50' :
                        'bg-green-500/20 border border-green-500/50'
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
                        // Fallback: fetch encounter by appointment_id (in case batch query missed it)
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
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl text-sm font-medium hover:from-blue-600 hover:to-cyan-600 transition-all shrink-0"
                    >
                      View
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination - below the list */}
        {!loading && appointments.length > 0 && filteredAppointments.length > 0 && (
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            <span className="text-blue-200 font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
            >
              Next
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  allowedRoles: [UserRole.DOCTOR],
  redirectTo: '/dashboard',
})

