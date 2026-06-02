'use client'

import { useAuth } from '@/lib/auth-context'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { ROLE_PERMISSIONS, getRoleLabel, UserRole } from '@/lib/roles'
import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n'
import { useUserLocations } from '@/lib/hooks/use-user-locations'
import { AssignedLocationsPanel } from '@/components/AssignedLocationsPanel'

interface UpcomingAppointment {
  id: string
  appointment_date: string
  appointment_time: string | null
  onsite_type: string | null
  encounter_id: number | null
  status?: string | null
  patient: {
    first_name: string
    last_name: string
  } | null
}

function DashboardPage() {
  const { user, role } = useAuth()
  const { t } = useT()
  const router = useRouter()
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [isToggling, setIsToggling] = useState(false)
  const [totalPatients, setTotalPatients] = useState<number>(0)
  const [totalConsultations, setTotalConsultations] = useState<number>(0)
  const [loadingStats, setLoadingStats] = useState(true)
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([])
  const [loadingAppointments, setLoadingAppointments] = useState(false)
  const [startingEncounterId, setStartingEncounterId] = useState<number | null>(null)
  const supabase = createClient()
  const {
    locations: assignedLocations,
    loading: locationsLoading,
    selectedLocationId,
  } = useUserLocations()

  const permissions = role ? ROLE_PERMISSIONS[role] : null
  const isDoctorLike = role === 'doctor' || role === 'admin'
  const isClinicalStaff = role === 'doctor' || role === 'nurse'

  const fetchAvailability = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      const response = await fetch('/api/doctors/availability', { credentials: 'include', headers })
      const json = await response.json()
      if (response.ok && json.data) {
        setIsAvailable(json.data.is_available ?? false)
      } else {
        setIsAvailable(false)
      }
    } catch (error) {
      setIsAvailable(false)
    }
  }, [supabase])

  const toggleAvailability = async () => {
    if (isToggling) return
    
    setIsToggling(true)
    try {
      const newStatus = !(isAvailable ?? false)
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      const response = await fetch('/api/doctors/availability', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ is_available: newStatus }),
      })

      const json = await response.json()
      if (response.ok && json.success) {
        setIsAvailable(json.data?.is_available ?? newStatus)
      } else {
        fetchAvailability()
      }
    } catch (error) {
      fetchAvailability()
    } finally {
      setIsToggling(false)
    }
  }

  const fetchStats = useCallback(async () => {
    if (!user || !isClinicalStaff) {
      setLoadingStats(false)
      return
    }

    setLoadingStats(true)
    try {
      const params =
        selectedLocationId !== 'all' ? `?location_id=${selectedLocationId}` : ''
      const res = await fetch(`/api/clinical/stats${params}`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok) {
        setTotalPatients(json.totalPatients ?? 0)
        setTotalConsultations(json.totalConsultations ?? 0)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoadingStats(false)
    }
  }, [user, isClinicalStaff, selectedLocationId])

  const fetchUpcomingAppointments = useCallback(async () => {
    if (!user || role !== 'doctor') {
      setUpcomingAppointments([])
      return
    }

    setLoadingAppointments(true)
    try {
      const { data: doctorData } = await supabase
        .from('doctors')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!doctorData) {
        setUpcomingAppointments([])
        setLoadingAppointments(false)
        return
      }

      const { data: encounters } = await supabase
        .from('encounters')
        .select('id, appointment_id, status')
        .eq('doctor_id', doctorData.id)

      if (!encounters || encounters.length === 0) {
        setUpcomingAppointments([])
        setLoadingAppointments(false)
        return
      }

      const appointmentIds = encounters.map(e => e.appointment_id).filter(Boolean)
      const today = new Date().toISOString().split('T')[0]

      const { data: appointmentsData } = await supabase
        .from('appointments')
        .select('id, appointment_date, appointment_time, onsite_type, patient_id')
        .in('id', appointmentIds)
        .gte('appointment_date', today)
        .order('appointment_date', { ascending: true })
        .limit(5)

      if (!appointmentsData || appointmentsData.length === 0) {
        setUpcomingAppointments([])
        setLoadingAppointments(false)
        return
      }

      const patientIds = [...new Set(appointmentsData.map(a => a.patient_id).filter(Boolean))]
      const { data: patientsData } = await supabase
        .from('patients')
        .select('id, first_name, last_name')
        .in('id', patientIds)

      const appointmentsWithPatients = appointmentsData.map(appointment => ({
        id: String(appointment.id),
        appointment_date: appointment.appointment_date,
        appointment_time: appointment.appointment_time ?? null,
        onsite_type: (appointment as { onsite_type?: string | null }).onsite_type ?? null,
        encounter_id: encounters.find((e) => e.appointment_id === appointment.id)?.id ?? null,
        status: encounters.find((e) => e.appointment_id === appointment.id)?.status ?? 'scheduled',
        patient: patientsData?.find(p => p.id === appointment.patient_id) || null,
      }))

      setUpcomingAppointments(appointmentsWithPatients)
    } catch (error) {
      console.error('Error in fetchUpcomingAppointments:', error)
      setUpcomingAppointments([])
    } finally {
      setLoadingAppointments(false)
    }
  }, [user, role, supabase])

  const startConsultation = useCallback(
    async (appointment: UpcomingAppointment) => {
      if (!appointment.encounter_id || startingEncounterId === appointment.encounter_id) return
      setStartingEncounterId(appointment.encounter_id)
      try {
        const { error: statusError } = await supabase
          .from('encounters')
          .update({
            status: 'in_consultation',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointment.encounter_id)

        if (statusError) {
          console.error('Error updating encounter status:', statusError)
        }

        const { error: appointmentError } = await supabase
          .from('appointments')
          .update({ status: 'in_progress' })
          .eq('id', Number(appointment.id))

        if (appointmentError) {
          console.error('Error updating appointment status:', appointmentError)
        }

        router.push(`/video?encounter=${appointment.encounter_id}`)
      } catch (error) {
        console.error('Error starting consultation:', error)
      } finally {
        setStartingEncounterId(null)
      }
    },
    [router, startingEncounterId, supabase]
  )

  const refreshAllData = useCallback(() => {
    if (user && isClinicalStaff) {
      fetchStats()
    }
    if (isDoctorLike && user) {
      fetchAvailability()
      fetchUpcomingAppointments()
    }
  }, [isClinicalStaff, isDoctorLike, user, fetchAvailability, fetchStats, fetchUpcomingAppointments])

  // Fetch doctor availability status
  useEffect(() => {
    if (isDoctorLike && user) {
      fetchAvailability()
    }
  }, [isDoctorLike, user, fetchAvailability])

  // Fetch statistics (doctors and nurses, scoped by assigned locations)
  useEffect(() => {
    if (isClinicalStaff) {
      fetchStats()
    }
  }, [fetchStats, isClinicalStaff])

  // Fetch upcoming appointments for doctors
  useEffect(() => {
    fetchUpcomingAppointments()
  }, [fetchUpcomingAppointments])

  // Refetch when tab becomes visible (user returns without page refresh)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user && isDoctorLike) {
        refreshAllData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [user, isDoctorLike, refreshAllData])

  return (
    <div className="p-6 lg:p-10">
      <div className="max-w-7xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-1">
            {t('dashboard.welcome_back_name', { name: user?.user_metadata?.full_name?.split(' ')[0] || 'User' })}
          </h2>
          <p className="text-slate-500 text-sm">
            {isDoctorLike
              ? t('dashboard.subtitle_doctor')
              : t('dashboard.subtitle_nurse')}
          </p>
        </div>

        {isClinicalStaff && (
          <AssignedLocationsPanel locations={assignedLocations} loading={locationsLoading} />
        )}

        {/* Role Badge, Refresh, and Availability Toggle (for doctors) */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-lg shadow-sm">
            <div className={`w-2.5 h-2.5 rounded-full ${isDoctorLike ? 'bg-[#2E6EF3]' : 'bg-emerald-500'}`}></div>
            <span className="text-slate-700 text-sm font-semibold">
              {t('dashboard.role_dashboard', { role: role ? (role === 'doctor' ? t('auth.role_doctor') : role === 'nurse' ? t('auth.role_nurse') : getRoleLabel(role)) : '' })}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {isDoctorLike && (
              <button
                onClick={refreshAllData}
                disabled={loadingStats || loadingAppointments}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
                title={t('common.refresh')}
              >
                <svg className={`w-4 h-4 ${loadingStats || loadingAppointments ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {t('common.refresh')}
              </button>
            )}
            {isDoctorLike && (
              <button
                onClick={toggleAvailability}
                disabled={isToggling}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm border ${
                  isAvailable
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>
                <span>{isToggling ? t('dashboard.updating') : isAvailable ? t('dashboard.available') : t('dashboard.unavailable')}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
          {/* Patient Records Card */}
          <Link
            href="/dashboard/patients-history"
            className="group bg-white border border-slate-200 rounded-2xl p-6 hover:border-[#2E6EF3]/40 hover:shadow-[0_8px_24px_rgba(30,64,175,0.08)] transition-all"
          >
            <div className="w-12 h-12 bg-[#2E6EF3]/10 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              {isDoctorLike ? t('dashboard.all_patients') : t('dashboard.assigned_patients')}
            </h3>
            <p className="text-slate-500 text-sm">
              {isDoctorLike
                ? t('dashboard.access_records')
                : t('dashboard.view_assigned')}
            </p>
            <div className="mt-4 inline-flex items-center text-[#2E6EF3] text-sm font-medium group-hover:translate-x-1 transition-transform">
              {t('dashboard.view_all')}
              <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          {/* Permissions Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="w-12 h-12 bg-[#2E6EF3]/10 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-3">{t('dashboard.your_permissions')}</h3>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                {permissions?.canEditPatients ? (
                  <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                <span>{t('dashboard.edit_patients')}</span>
              </div>
              <div className="flex items-center gap-2">
                {permissions?.canCreateAppointments ? (
                  <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                <span>{t('dashboard.create_appointments')}</span>
              </div>
              <div className="flex items-center gap-2">
                {permissions?.canViewAllRecords ? (
                  <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-rose-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                <span>{t('dashboard.view_all_records')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">
                {isDoctorLike ? t('dashboard.total_patients') : t('dashboard.assigned_patients_stat')}
              </p>
              <div className="w-9 h-9 bg-[#2E6EF3]/10 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            {loadingStats ? (
              <div className="h-9 w-16 bg-slate-100 rounded animate-pulse" />
            ) : (
              <>
                <p className="text-3xl font-bold text-slate-900">{totalPatients}</p>
                <p className="text-xs text-slate-500 mt-1">{t('dashboard.currently_active')}</p>
              </>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('dashboard.total_consultations')}</p>
              <div className="w-9 h-9 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            {loadingStats ? (
              <div className="h-9 w-16 bg-slate-100 rounded animate-pulse" />
            ) : (
              <>
                <p className="text-3xl font-bold text-slate-900">{totalConsultations}</p>
                <p className="text-xs text-slate-500 mt-1">{t('dashboard.completed_consultations')}</p>
              </>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('dashboard.system_status')}</p>
              <div className="w-9 h-9 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900">{t('common.online')}</p>
            <p className="text-xs text-emerald-600 mt-1">{t('dashboard.systems_operational')}</p>
          </div>
        </div>

        {/* Upcoming Appointments (Doctor only) */}
        {isDoctorLike && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{t('dashboard.upcoming_appointments')}</h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  {t('dashboard.scheduled_visits')}
                </p>
              </div>
            </div>

            {loadingAppointments ? (
              <div className="py-6 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : upcomingAppointments.length === 0 ? (
              <p className="text-slate-500 text-sm">{t('dashboard.no_upcoming')}</p>
            ) : (
              <div className="space-y-2">
                {upcomingAppointments.map((appt) => {
                  const dateTimeStr = appt.appointment_time
                    ? `${appt.appointment_date}T${appt.appointment_time}`
                    : appt.appointment_date
                  const date = new Date(dateTimeStr)
                  const dateLabel = date.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                  const timeLabel = appt.appointment_time
                    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                    : null

                  return (
                    <div
                      key={appt.id}
                      className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <p className="text-slate-900 font-medium text-sm">
                          {appt.patient
                            ? `${appt.patient.first_name} ${appt.patient.last_name}`
                            : t('dashboard.unknown_patient')}
                        </p>
                        <p className="text-slate-500 text-xs mt-0.5">
                          {dateLabel}{timeLabel ? ` • ${timeLabel}` : ''}
                        </p>
                        {appt.onsite_type && (
                          <p className="text-slate-400 text-xs mt-0.5">
                            Type: {String(appt.onsite_type).replace(/_/g, ' ')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {!appt.status || appt.status === 'scheduled'
                            ? t('common.scheduled')
                            : appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void startConsultation(appt)}
                          disabled={!appt.encounter_id || startingEncounterId === appt.encounter_id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2E6EF3] text-white hover:bg-[#1f5ad2] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {startingEncounterId === appt.encounter_id
                            ? t('dashboard.starting_consultation')
                            : t('dashboard.start_consultation')}
                        </button>
                      </div>
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
  allowedRoles: [UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE],
  redirectTo: '/',
})
