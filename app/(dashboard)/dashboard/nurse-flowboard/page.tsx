'use client'

import { useAuth } from '@/lib/auth-context'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { EncounterDetailModal } from '@/components/EncounterDetailModal'
import { canJoinTelemedicine, getStatusInfo, type EncounterStatus } from '@/lib/encounter-status'
import { VitalsFormModal } from '@/components/VitalsFormModal'
import { AssignProviderModal } from '@/components/AssignProviderModal'
import { UserRole } from '@/lib/roles'

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

function NurseFlowboardPage() {
  const { user, role } = useAuth()
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const cached = sessionStorage.getItem(NURSE_FLOWBOARD_CACHE_KEY)
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([])
  const [availableDoctors, setAvailableDoctors] = useState<AvailableDoctor[]>([])
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true
    return !sessionStorage.getItem(NURSE_FLOWBOARD_CACHE_KEY)
  })
  const [assigningDoctor, setAssigningDoctor] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
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
  const [isRefreshing, setIsRefreshing] = useState(false)
  const initialLoadDone = useRef(false)
  const supabase = useMemo(() => createClient(), [])

  const fetchAvailableDoctors = useCallback(async () => {
    try {
      // Fetch all doctors
      const { data: doctorsData, error: doctorsError } = await supabase
        .from('doctors')
        .select('id, user_id, full_name, email, specialty')
        .order('full_name', { ascending: true })

      if (doctorsError) {
        console.error('Error fetching doctors:', doctorsError)
        setAvailableDoctors([])
        return
      }

      if (!doctorsData || doctorsData.length === 0) {
        setAvailableDoctors([])
        return
      }

      // Fetch availability status for each doctor
      const doctorIds = doctorsData.map(d => d.id)
      const { data: availabilityData, error: availabilityError } = await supabase
        .from('doctor_availability')
        .select('doctor_id, is_available')
        .in('doctor_id', doctorIds)

      // Combine doctors with availability
      const doctorsWithAvailability = doctorsData.map(doctor => {
        const availability = availabilityData?.find(a => a.doctor_id === doctor.id)
        return {
          ...doctor,
          is_available: availability?.is_available ?? false,
        }
      })

      // Filter to only available doctors
      const available = doctorsWithAvailability.filter(d => d.is_available)
      setAvailableDoctors(available)
    } catch (error) {
      console.error('Error in fetchAvailableDoctors:', error)
      setAvailableDoctors([])
    }
  }, [supabase])

  const fetchAllAppointments = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      else setIsRefreshing(true)

      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('appointments')
        .select('id, patient_id, appointment_date, appointment_time, onsite_type, status, notes, created_at')
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true })

      if (appointmentsError) {
        console.error('Error fetching appointments:', appointmentsError)
        setLoading(false)
        return
      }

      if (appointmentsData && appointmentsData.length > 0) {
        const patientIds = [...new Set(appointmentsData.map(a => a.patient_id))]

        const { data: patientsData, error: patientsError } = await supabase
          .from('patients')
          .select('id, first_name, last_name, email, phone')
          .in('id', patientIds)

        if (patientsError) {
          console.error('Error fetching patients:', patientsError)
        }

        const appointmentIds = appointmentsData.map(a => a.id)
        const { data: encountersData, error: encountersError } = await supabase
          .from('encounters')
          .select('id, appointment_id, status, doctor_id')
          .in('appointment_id', appointmentIds)

        if (encountersError) {
          console.error('Error fetching encounters:', encountersError)
        }

        // Get doctor IDs from encounters
        const doctorIds = encountersData?.map(e => e.doctor_id).filter(Boolean) || []
        let doctorsData: any[] = []
        if (doctorIds.length > 0) {
          const { data: docsData } = await supabase
            .from('doctors')
            .select('id, full_name, email')
            .in('id', doctorIds)
          doctorsData = docsData || []
        }

        const appointmentsWithDetails = appointmentsData.map(appointment => {
          const encounter = encountersData?.find(e => e.appointment_id === appointment.id)
          const assignedDoctor = encounter?.doctor_id 
            ? doctorsData.find(d => d.id === encounter.doctor_id)
            : null

          return {
            ...appointment,
            patient: patientsData?.find(p => p.id === appointment.patient_id),
            encounter_status: encounter?.status || null,
            encounter_id: encounter?.id || undefined,
            assigned_doctor: assignedDoctor ? {
              id: assignedDoctor.id,
              full_name: assignedDoctor.full_name,
              email: assignedDoctor.email,
            } : undefined,
          }
        })

        setAppointments(appointmentsWithDetails as Appointment[])
        setFilteredAppointments(appointmentsWithDetails as Appointment[])
        try {
          sessionStorage.setItem(NURSE_FLOWBOARD_CACHE_KEY, JSON.stringify(appointmentsWithDetails))
        } catch {
          // ignore storage errors
        }
      } else {
        setAppointments([])
        setFilteredAppointments([])
      }
    } catch (error) {
      console.error('Error in fetchAllAppointments:', error)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [supabase])

  useEffect(() => {
    if (user && (role === 'nurse' || role === 'staff') && !initialLoadDone.current) {
      initialLoadDone.current = true
      const hasCache =
        typeof window !== 'undefined' && !!sessionStorage.getItem(NURSE_FLOWBOARD_CACHE_KEY)
      fetchAllAppointments(!hasCache)
      fetchAvailableDoctors()
    }
  }, [user, role, fetchAllAppointments, fetchAvailableDoctors])

  const handleRefresh = () => {
    try {
      sessionStorage.removeItem(NURSE_FLOWBOARD_CACHE_KEY)
    } catch {
      // ignore
    }
    fetchAllAppointments(true)
    fetchAvailableDoctors()
  }

  // Filter and sort appointments
  useEffect(() => {
    let result = [...appointments]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(a => 
        a.patient?.first_name.toLowerCase().includes(query) ||
        a.patient?.last_name.toLowerCase().includes(query) ||
        a.patient_id.toString().includes(query) ||
        a.assigned_doctor?.full_name.toLowerCase().includes(query)
      )
    }

    // Encounter status filter
    if (filterStatus !== 'all') {
      result = result.filter(a => a.encounter_status === filterStatus)
    }

    // Sort
    switch (sortBy) {
      case 'time':
        result.sort((a, b) => {
          const dateA = a.appointment_date && a.appointment_time ? new Date(`${a.appointment_date}T${a.appointment_time}`) : new Date(0)
          const dateB = b.appointment_date && b.appointment_time ? new Date(`${b.appointment_date}T${b.appointment_time}`) : new Date(0)
          return dateA.getTime() - dateB.getTime()
        })
        break
      case 'name':
        result.sort((a, b) => {
          const nameA = `${a.patient?.last_name || ''} ${a.patient?.first_name || ''}`
          const nameB = `${b.patient?.last_name || ''} ${b.patient?.first_name || ''}`
          return nameA.localeCompare(nameB)
        })
        break
      case 'treatment':
        result.sort((a, b) => (a.onsite_type || '').localeCompare(b.onsite_type || ''))
        break
    }

    setFilteredAppointments(result)
  }, [appointments, searchQuery, sortBy, filterStatus])

  // Paginate filtered results
  const paginatedAppointments = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredAppointments.slice(start, start + pageSize)
  }, [filteredAppointments, page, pageSize])

  const totalPages = Math.ceil(filteredAppointments.length / pageSize) || 1

  const assignDoctorToAppointment = async (appointmentId: number, doctorId: string, appointmentDate?: string, appointmentTime?: string) => {
    setAssigningDoctor(appointmentId.toString())
    try {
      const doctorIdNum = parseInt(doctorId)
      if (isNaN(doctorIdNum)) {
        alert('Invalid doctor ID')
        return
      }

      const appointment = appointments.find(a => a.id === appointmentId)
      if (!appointment) {
        alert('Appointment not found')
        return
      }

      // Update appointment date and time if provided
      if (appointmentDate || appointmentTime) {
        const updateData: { appointment_date?: string; appointment_time?: string } = {}
        if (appointmentDate) updateData.appointment_date = appointmentDate
        if (appointmentTime) updateData.appointment_time = appointmentTime

        const { error: updateError } = await supabase
          .from('appointments')
          .update(updateData)
          .eq('id', appointmentId)

        if (updateError) {
          console.error('Error updating appointment date/time:', updateError)
        }
      }

      // Check if encounter exists
      const { data: existingEncounter } = await supabase
        .from('encounters')
        .select('id, status')
        .eq('appointment_id', appointmentId)
        .maybeSingle()

      if (existingEncounter) {
        // Update encounter with doctor_id and set status to provider_assigned
        const { error } = await supabase
          .from('encounters')
          .update({ 
            doctor_id: doctorIdNum,
            status: 'provider_assigned',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingEncounter.id)

        if (error) {
          console.error('Error updating encounter:', error)
          alert('Failed to assign doctor. Please try again.')
          return
        }
      } else {
        // Create new encounter with doctor_id and status provider_assigned
        const { error } = await supabase
          .from('encounters')
          .insert({
            appointment_id: appointmentId,
            patient_id: appointment.patient_id,
            doctor_id: doctorIdNum,
            status: 'provider_assigned',
          })

        if (error) {
          console.error('Error creating encounter:', error)
          alert('Failed to assign doctor. Please try again.')
          return
        }
      }

      // Update appointment status to in_progress
      await supabase
        .from('appointments')
        .update({ status: 'in_progress' })
        .eq('id', appointmentId)

      await fetchAllAppointments()
      await fetchAvailableDoctors()
    } catch (error) {
      console.error('Error assigning doctor:', error)
      alert('Failed to assign doctor. Please try again.')
    } finally {
      setAssigningDoctor(null)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const formatTime = (timeString: string | null) => {
    if (!timeString) return 'N/A'
    const time = timeString.split(':')
    if (time.length < 2 || !time[0] || !time[1]) return 'N/A'
    const hours = parseInt(time[0])
    const minutes = time[1]
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes} ${ampm}`
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Flowboard</h1>
          <p className="text-blue-200">
            Manage appointments and assign providers
          </p>
        </div>

        {/* Stats Cards - Only for Nurse */}
        {role === 'nurse' && !loading && appointments.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl p-4">
              <p className="text-blue-200 text-sm">Total Appointments</p>
              <p className="text-2xl font-bold text-white">{appointments.length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl p-4">
              <p className="text-blue-200 text-sm">Assigned</p>
              <p className="text-2xl font-bold text-green-300">
                {appointments.filter(a => a.assigned_doctor).length}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl p-4">
              <p className="text-blue-200 text-sm">Unassigned</p>
              <p className="text-2xl font-bold text-yellow-300">
                {appointments.filter(a => !a.assigned_doctor).length}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl p-4">
              <p className="text-blue-200 text-sm">Available Providers</p>
              <p className="text-2xl font-bold text-white">{availableDoctors.length}</p>
            </div>
          </div>
        )}

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
                placeholder="Search by patient name, ID, or provider..."
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
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
                  setSortBy(e.target.value as typeof sortBy)
                  setPage(1)
                }}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="time">Appointment Time</option>
                <option value="name">Patient Name</option>
                <option value="treatment">Treatment Type</option>
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
                <option value="appointment_initiated">Appointment Initiated</option>
                <option value="provider_assigned">Provider Assigned</option>
                <option value="vitals_assessed">Vitals Assessed</option>
                <option value="in_consultation">In Consultation</option>
                <option value="consultation_concluded">Consultation Concluded</option>
                <option value="final_review">Final Review</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Results count, page size, and available doctors */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-blue-200">
              Showing{' '}
              <span className="text-white font-medium">
                {filteredAppointments.length === 0 ? 0 : (page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, filteredAppointments.length)}
              </span>{' '}
              of <span className="text-white font-medium">{filteredAppointments.length}</span> appointments
              {searchQuery || filterStatus !== 'all'
                ? ` (filtered from ${appointments.length})`
                : ''}
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
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {availableDoctors.length > 0 && (
                <p className="text-sm text-green-300">
                  <span className="font-semibold">{availableDoctors.length}</span> provider(s) available
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Appointments Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner message="Loading appointments..." />
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-12 text-center">
            <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              {searchQuery || filterStatus !== 'all' ? 'No Results Found' : 'No Appointments'}
            </h3>
            <p className="text-blue-200">
              {searchQuery || filterStatus !== 'all' 
                ? 'Try adjusting your search or filters.' 
                : 'No appointments have been created yet.'}
            </p>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
            {/* Table Header */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-6 py-4 bg-white/5 border-b border-white/10 text-sm font-medium text-blue-200">
              <div className="col-span-3">Patient</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Appointment</div>
              <div className="col-span-2">Provider</div>
              <div className="col-span-3 text-right">Actions</div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-white/10">
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
                  className="grid grid-cols-1 lg:grid-cols-12 gap-4 px-6 py-4 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  {/* Patient Info */}
                  <div className="lg:col-span-3 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-sm">
                      {appointment.patient?.first_name?.charAt(0) || '?'}{appointment.patient?.last_name?.charAt(0) || ''}
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-sm">
                        {appointment.patient
                          ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                          : 'Unknown Patient'}
                      </h3>
                      <p className="text-blue-300 text-xs font-mono">ID: {appointment.patient_id}</p>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="lg:col-span-2 flex items-center">
                    {appointment.encounter_status ? (
                      (() => {
                        const info = getStatusInfo(appointment.encounter_status as EncounterStatus)
                        const baseColor =
                          info?.value === 'appointment_initiated'
                            ? 'bg-gray-500/20 text-gray-200 border border-gray-500/40'
                            : info?.value === 'provider_assigned'
                            ? 'bg-blue-500/20 text-blue-200 border border-blue-500/40'
                            : info?.value === 'vitals_assessed'
                            ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40'
                            : info?.value === 'in_consultation'
                            ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/40'
                            : info?.value === 'consultation_concluded'
                            ? 'bg-orange-500/20 text-orange-200 border border-orange-500/40'
                            : info?.value === 'final_review'
                            ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                            : 'bg-green-500/20 text-green-200 border border-green-500/40'

                        return (
                          <span className={`px-3 py-1 rounded-lg text-xs font-medium ${baseColor}`}>
                            {info?.label || appointment.encounter_status}
                          </span>
                        )
                      })()
                    ) : (
                      <span className="px-3 py-1 rounded-lg text-xs font-medium bg-white/10 text-blue-200 border border-white/20">
                        Not Started
                      </span>
                    )}
                  </div>

                  {/* Appointment Time */}
                  <div className="lg:col-span-2 flex flex-col justify-center">
                    <p className="text-white text-sm">{appointment.appointment_date ? formatDate(appointment.appointment_date) : 'N/A'}</p>
                    <p className="text-blue-200 text-xs">{appointment.appointment_time ? formatTime(appointment.appointment_time) : 'N/A'}</p>
                  </div>

                  {/* Provider */}
                  <div className="lg:col-span-2 flex items-center">
                    {appointment.assigned_doctor ? (
                      <div>
                        <p className="text-white text-sm">{appointment.assigned_doctor.full_name}</p>
                        <span className="text-xs text-green-300">Assigned</span>
                      </div>
                    ) : (
                      <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded text-xs">
                        Unassigned
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="lg:col-span-3 flex items-center justify-end gap-2">
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
                        className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:from-blue-600 hover:to-cyan-600 transition-all"
                      >
                        View
                      </button>
                    )}
                    {!appointment.assigned_doctor && availableDoctors.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowAssignModal({ appointmentId: appointment.id, appointment })
                        }}
                        disabled={assigningDoctor === appointment.id.toString()}
                        className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg text-sm font-medium hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50"
                      >
                        Assign Provider
                      </button>
                    )}
                    {appointment.assigned_doctor && appointment.encounter_status === 'provider_assigned' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowAssignModal({ appointmentId: appointment.id, appointment })
                        }}
                        disabled={assigningDoctor === appointment.id.toString()}
                        className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-lg text-sm font-medium hover:from-yellow-600 hover:to-amber-600 transition-all disabled:opacity-50"
                      >
                        Edit
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
                        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:from-purple-600 hover:to-pink-600 transition-all"
                      >
                        Vitals
                      </button>
                    )}
                    {availableDoctors.length === 0 && !appointment.assigned_doctor && (
                      <span className="text-red-300 text-xs">No providers available</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pagination below table */}
        {!loading && filteredAppointments.length > 0 && (
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
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
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

export default withRoleProtection(NurseFlowboardPage, {
  allowedRoles: [UserRole.NURSE, UserRole.STAFF],
  redirectTo: '/dashboard',
})
