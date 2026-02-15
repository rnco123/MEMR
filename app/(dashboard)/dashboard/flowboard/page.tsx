'use client'

import { useAuth } from '@/lib/auth-context'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { getStatusInfo, type EncounterStatus, ENCOUNTER_STATUSES } from '@/lib/encounter-status'
import { EncounterDetailModal } from '@/components/EncounterDetailModal'
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
  patient?: {
    id: number
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
  }
}

function FlowboardPage() {
  const { user, role } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selectedEncounter, setSelectedEncounter] = useState<{ encounterId: number; appointmentId: number; patientId: number } | null>(null)
  const supabase = createClient()

  const fetchAssignedAppointments = useCallback(async () => {
    try {
      setLoading(true)
      
      // First, get the doctor record for this user
      const { data: doctorData, error: doctorError } = await supabase
        .from('doctors')
        .select('id')
        .eq('user_id', user?.id)
        .single()

      if (doctorError || !doctorData) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching doctor record:', doctorError)
        }
        setAppointments([])
        setLoading(false)
        return
      }

      // Fetch encounters assigned to this doctor that are provider_assigned or later (not appointment_initiated or completed)
      const { data: encounters, error: encountersError } = await supabase
        .from('encounters')
        .select('id, appointment_id, patient_id, status, doctor_id')
        .eq('doctor_id', doctorData.id)
        .neq('status', 'completed')
        .neq('status', 'appointment_initiated')
        .order('created_at', { ascending: false })

      if (encountersError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching encounters:', encountersError)
        }
        setLoading(false)
        return
      }

      if (!encounters || encounters.length === 0) {
        setAppointments([])
        setLoading(false)
        return
      }

      // Get unique appointment IDs
      const appointmentIds = [...new Set(encounters.map(e => e.appointment_id))]

      if (appointmentIds.length === 0) {
        setAppointments([])
        setLoading(false)
        return
      }

      // Fetch appointments
      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('appointments')
        .select('id, patient_id, appointment_date, appointment_time, onsite_type, status, notes, created_at')
        .in('id', appointmentIds)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true })

      if (appointmentsError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching appointments:', appointmentsError)
        }
        setLoading(false)
        return
      }

      // Fetch patient details for each appointment
      if (appointmentsData && appointmentsData.length > 0) {
        const patientIds = [...new Set(appointmentsData.map(a => a.patient_id))]

        const { data: patientsData, error: patientsError } = await supabase
          .from('patients')
          .select('id, first_name, last_name, email, phone')
          .in('id', patientIds)

        if (patientsError && process.env.NODE_ENV === 'development') {
          console.error('Error fetching patients:', patientsError)
        }

        // Combine appointments with patient data and encounter status
        const appointmentsWithPatients = appointmentsData.map(appointment => {
          const encounter = encounters.find(e => e.appointment_id === appointment.id)
          return {
            ...appointment,
            patient: patientsData?.find(p => p.id === appointment.patient_id),
            encounter_status: encounter?.status || null,
            encounter_id: encounter?.id || null,
          }
        })

        setAppointments(appointmentsWithPatients as Appointment[])
      } else {
        setAppointments([])
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error in fetchAssignedAppointments:', error)
      }
    } finally {
      setLoading(false)
    }
  }, [user, supabase])

  useEffect(() => {
    if (user && role === 'doctor') {
      fetchAssignedAppointments()
    }
  }, [user, role, fetchAssignedAppointments])

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

  // Filter and sort appointments
  const filteredAppointments = useMemo(() => {
    let result = [...appointments]

    // Search filter - by patient ID, name, email, or phone
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(appointment => 
        appointment.patient_id.toString().includes(query) ||
        appointment.patient?.first_name.toLowerCase().includes(query) ||
        appointment.patient?.last_name.toLowerCase().includes(query) ||
        appointment.patient?.email?.toLowerCase().includes(query) ||
        appointment.patient?.phone?.includes(query)
      )
    }

    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter(appointment => appointment.encounter_status === filterStatus)
    }

    // Sort by time slot only
    result.sort((a, b) => {
      const timeA = a.appointment_time || ''
      const timeB = b.appointment_time || ''
      return timeA.localeCompare(timeB)
    })

    return result
  }, [appointments, searchQuery, filterStatus])

  return (
    <div className="p-6 lg:p-12">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Flowboard</h1>
          <p className="text-blue-200 text-lg">
            Your assigned active encounters
          </p>
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
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by patient ID, name, email, or phone..."
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-blue-200 text-sm whitespace-nowrap">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                {ENCOUNTER_STATUSES.filter(s => s.value !== 'completed' && s.value !== 'appointment_initiated').map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Results count */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-blue-200">
              Showing <span className="text-white font-medium">{filteredAppointments.length}</span> of <span className="text-white font-medium">{appointments.length}</span> encounters
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-sm text-blue-300 hover:text-white transition-colors"
              >
                Clear search
              </button>
            )}
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
            {filteredAppointments.map((appointment) => (
              <div
                key={appointment.id}
                onClick={() => {
                  if (appointment.encounter_id) {
                    setSelectedEncounter({
                      encounterId: appointment.encounter_id,
                      appointmentId: appointment.id,
                      patientId: appointment.patient_id,
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
                  </div>
                </div>
              </div>
            ))}
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
            // Navigate to telemedicine page or open video call
            window.open(`/video?encounter=${selectedEncounter.encounterId}`, '_blank')
          }}
        />
      )}
    </div>
  )
}

export default withRoleProtection(FlowboardPage, {
  allowedRoles: [UserRole.DOCTOR],
  redirectTo: '/dashboard',
})

