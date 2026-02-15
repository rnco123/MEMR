'use client'

import { useAuth } from '@/lib/auth-context'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { ROLE_PERMISSIONS, getRoleLabel, UserRole } from '@/lib/roles'
import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner } from '@/components/LoadingSpinner'

interface UpcomingAppointment {
  id: string
  appointment_date: string
  appointment_type: string | null
  status: string
  patient: {
    first_name: string
    last_name: string
  } | null
}

function DashboardPage() {
  const { user, role } = useAuth()
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [isToggling, setIsToggling] = useState(false)
  const [totalPatients, setTotalPatients] = useState<number>(0)
  const [totalConsultations, setTotalConsultations] = useState<number>(0)
  const [loadingStats, setLoadingStats] = useState(true)
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([])
  const [loadingAppointments, setLoadingAppointments] = useState(false)
  const supabase = createClient()

  const permissions = role ? ROLE_PERMISSIONS[role] : null

  const fetchAvailability = async () => {
    try {
      const response = await fetch(`/api/doctors/availability?doctor_id=${user?.id}`)
      if (response.ok) {
        const { data } = await response.json()
        setIsAvailable(data?.is_available ?? false)
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching availability:', error)
      }
    }
  }

  const toggleAvailability = async () => {
    if (isToggling) return
    
    setIsToggling(true)
    try {
      const newStatus = !isAvailable
      const response = await fetch('/api/doctors/availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_available: newStatus }),
      })

      if (response.ok) {
        setIsAvailable(newStatus)
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to update availability')
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error toggling availability:', error)
      }
    } finally {
      setIsToggling(false)
    }
  }

  // Fetch doctor availability status
  useEffect(() => {
    if (role === 'doctor' && user) {
      fetchAvailability()
    }
  }, [role, user])

  // Fetch statistics
  useEffect(() => {
    const fetchStats = async () => {
      if (!user || role !== 'doctor') {
        setLoadingStats(false)
        return
      }

      setLoadingStats(true)
      try {
        // Get doctor ID
        const { data: doctorData } = await supabase
          .from('doctors')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (!doctorData) {
          setLoadingStats(false)
          return
        }

        // Fetch total patients count
        const { count: patientsCount } = await supabase
          .from('patients')
          .select('id', { count: 'exact', head: true })

        setTotalPatients(patientsCount || 0)

        // Fetch total consultations (encounters with status consultation_concluded, final_review, or completed)
        const { count: consultationsCount } = await supabase
          .from('encounters')
          .select('id', { count: 'exact', head: true })
          .eq('doctor_id', doctorData.id)
          .in('status', ['consultation_concluded', 'final_review', 'completed'])

        setTotalConsultations(consultationsCount || 0)
      } catch (error) {
        console.error('Error fetching stats:', error)
      } finally {
        setLoadingStats(false)
      }
    }

    fetchStats()
  }, [user, role, supabase])

  // Fetch upcoming appointments for doctors
  useEffect(() => {
    const fetchUpcomingAppointments = async () => {
      if (!user || role !== 'doctor') {
        setUpcomingAppointments([])
        return
      }

      setLoadingAppointments(true)
      try {
        const now = new Date()
        const startOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0
        )
        const endOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
          999
        )

        const { data, error } = await supabase
          .from('appointments')
          .select(
            `id, appointment_date, appointment_type, status, patients:patient_id(first_name, last_name)`
          )
          .eq('doctor_id', user.id)
          .eq('status', 'scheduled')
          .gte('appointment_date', startOfDay.toISOString())
          .lte('appointment_date', endOfDay.toISOString())
          .order('appointment_date', { ascending: true })
          .limit(5)

        if (error) {
          console.error('Error fetching upcoming appointments:', error)
          setUpcomingAppointments([])
        } else {
          const mapped =
            data?.map((row: any) => ({
              id: row.id as string,
              appointment_date: row.appointment_date as string,
              appointment_type: (row.appointment_type as string | null) ?? null,
              status: row.status as string,
              patient: row.patients
                ? {
                    first_name: row.patients.first_name as string,
                    last_name: row.patients.last_name as string,
                  }
                : null,
            })) ?? []

          setUpcomingAppointments(mapped)
        }
      } catch (error) {
        console.error('Error in fetchUpcomingAppointments:', error)
        setUpcomingAppointments([])
      } finally {
        setLoadingAppointments(false)
      }
    }

    fetchUpcomingAppointments()
  }, [user, role, supabase])

  return (
    <div className="p-6 lg:p-12">
      <div className="max-w-7xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-12">
          <h2 className="text-4xl font-bold text-white mb-2">
            Welcome back, {user?.user_metadata?.full_name?.split(' ')[0] || 'User'}!
          </h2>
          <p className="text-blue-200 text-lg">
            {role === 'doctor' 
              ? 'Manage all patients and medical records' 
              : 'View and manage your assigned patients'}
          </p>
        </div>

        {/* Role Badge and Availability Toggle (for doctors) */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl">
            <div className={`w-3 h-3 rounded-full ${role === 'doctor' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
            <span className="text-white font-medium">
              {role && getRoleLabel(role)} Dashboard
            </span>
          </div>
          
          {role === 'doctor' && (
            <button
              onClick={toggleAvailability}
              disabled={isToggling}
              className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 ${
                isAvailable
                  ? 'bg-green-500/20 border border-green-500/50 text-green-200 hover:bg-green-500/30'
                  : 'bg-gray-500/20 border border-gray-500/50 text-gray-200 hover:bg-gray-500/30'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className={`w-3 h-3 rounded-full ${isAvailable ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              <span>{isToggling ? 'Updating...' : isAvailable ? 'Available' : 'Unavailable'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>
          )}
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Patient Records Card */}
          <Link
            href="/dashboard/patients-history"
            className="group bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 hover:bg-white/15 transition-all duration-300"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              {role === 'doctor' ? 'All Patients' : 'Assigned Patients'}
            </h3>
            <p className="text-blue-200 text-sm">
              {role === 'doctor' 
                ? 'Access and manage all patient records' 
                : 'View and manage your assigned patients'}
            </p>
            <div className="mt-4 flex items-center text-purple-400 text-sm font-medium group-hover:translate-x-2 transition-transform">
              View All
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          {/* Permissions Card */}
          <div className="group bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 hover:bg-white/15 transition-all duration-300">
            <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Your Permissions</h3>
            <div className="space-y-2 text-sm text-blue-200">
              <div className="flex items-center gap-2">
                {permissions?.canEditPatients ? (
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                <span>Edit Patients</span>
              </div>
              <div className="flex items-center gap-2">
                {permissions?.canCreateAppointments ? (
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                <span>Create Appointments</span>
              </div>
              <div className="flex items-center gap-2">
                {permissions?.canViewAllRecords ? (
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                <span>View All Records</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-blue-200 text-sm font-medium">
                {role === 'doctor' ? 'Total Patients' : 'Assigned Patients'}
              </p>
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            {loadingStats ? (
              <LoadingSpinner message="" />
            ) : (
              <>
                <p className="text-3xl font-bold text-white">{totalPatients}</p>
                <p className="text-xs text-blue-300 mt-1">Currently active</p>
              </>
            )}
          </div>

          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-blue-200 text-sm font-medium">Total Consultations</p>
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            {loadingStats ? (
              <LoadingSpinner message="" />
            ) : (
              <>
                <p className="text-3xl font-bold text-white">{totalConsultations}</p>
                <p className="text-xs text-green-300 mt-1">Completed consultations</p>
              </>
            )}
          </div>

          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-blue-200 text-sm font-medium">System Status</p>
              <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">Online</p>
            <p className="text-xs text-cyan-300 mt-1">All systems operational</p>
          </div>
        </div>

        {/* Upcoming Appointments (Doctor only) */}
        {role === 'doctor' && (
          <div className="mt-4 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-white">Upcoming Appointments</h3>
                <p className="text-blue-200 text-sm">
                  Scheduled visits for today
                </p>
              </div>
            </div>

            {loadingAppointments ? (
              <div className="py-6 flex justify-center">
                <LoadingSpinner message="Loading appointments..." />
              </div>
            ) : upcomingAppointments.length === 0 ? (
              <p className="text-blue-200 text-sm">No upcoming appointments.</p>
            ) : (
              <div className="space-y-3">
                {upcomingAppointments.map((appt) => {
                  const date = new Date(appt.appointment_date)
                  const dateLabel = date.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                  const timeLabel = date.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })

                  return (
                    <div
                      key={appt.id}
                      className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                    >
                      <div>
                        <p className="text-white font-medium">
                          {appt.patient
                            ? `${appt.patient.first_name} ${appt.patient.last_name}`
                            : 'Unknown patient'}
                        </p>
                        <p className="text-blue-200 text-xs">
                          {dateLabel} • {timeLabel}
                        </p>
                        {appt.appointment_type && (
                          <p className="text-blue-300 text-xs mt-1">
                            Type: {appt.appointment_type}
                          </p>
                        )}
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-200 border border-emerald-500/40">
                        {appt.status === 'scheduled'
                          ? 'Scheduled'
                          : appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}

// Protect the dashboard with HOC - only doctors and nurses can access
export default withRoleProtection(DashboardPage, {
  allowedRoles: [UserRole.DOCTOR, UserRole.NURSE],
  redirectTo: '/',
})
