'use client'

import { useAuth } from '@/lib/auth-context'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { UserRole } from '@/lib/roles'
import * as Sentry from '@sentry/nextjs'
import { useT } from '@/lib/i18n'

interface Patient {
  id: number // bigint
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
  gender?: string
  created_at: string
  encounter_count?: number
  last_visit?: string
}

const PAGE_SIZE = 10

function PatientsHistoryPage() {
  const { user, role } = useAuth()
  const { t } = useT()
  const [patients, setPatients] = useState<Patient[]>([])
  const [totalPatientCount, setTotalPatientCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'visits'>('name')
  const [filterGender, setFilterGender] = useState<'all' | 'Male' | 'Female'>('all')
  const supabase = useMemo(() => createClient(), [])
  const prevSearchRef = useRef(debouncedSearch)
  const prevFilterRef = useRef(filterGender)

  // Debounce search (300ms) to avoid fetch on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Fetch patients for current page (search applies to ALL records)
  const fetchPatients = useCallback(async (pageOverride?: number) => {
    const pageToUse = pageOverride ?? page
    try {
      setLoading(true)
      const from = (pageToUse - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const trimmed = debouncedSearch.trim()

      // Build base query; filters must be applied before .order()/.range() so .or() is available
      let query = supabase
        .from('patients')
        .select('id, first_name, last_name, email, phone, date_of_birth, gender, created_at')

      if (trimmed) {
        const term = `%${trimmed}%`
        const numTerm = parseInt(trimmed, 10)
        if (!isNaN(numTerm)) {
          query = query.or(
            `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term},id.eq.${numTerm}`
          )
        } else {
          query = query.or(
            `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`
          )
        }
      }
      if (filterGender !== 'all') {
        query = query.eq('gender', filterGender)
      }

      const { data: patientsData, error: patientsError } = await query
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
        .range(from, to)

      if (patientsError) {
        console.error('Error fetching patients:', patientsError)
        Sentry.captureException(patientsError, {
          tags: { component: 'PatientsHistoryPage', action: 'fetchPatients' },
        })
        setPatients([])
        return
      }

      // Fetch total count with same filters (search on all)
      let countQuery = supabase.from('patients').select('id', { count: 'exact', head: true })
      if (trimmed) {
        const term = `%${trimmed}%`
        const numTerm = parseInt(trimmed, 10)
        if (!isNaN(numTerm)) {
          countQuery = countQuery.or(
            `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term},id.eq.${numTerm}`
          )
        } else {
          countQuery = countQuery.or(
            `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`
          )
        }
      }
      if (filterGender !== 'all') {
        countQuery = countQuery.eq('gender', filterGender)
      }
      const { count, error: countError } = await countQuery
      setTotalPatientCount(countError ? null : (count ?? 0))

      if (!patientsData || patientsData.length === 0) {
        setPatients([])
        return
      }

      const patientIds = patientsData.map(p => p.id)
      const encounterCounts: Record<number, number> = {}
      const encounterLastVisits: Record<number, string> = {}
      const appointmentLastVisits: Record<number, string> = {}
      const appointmentToPatient: Record<number, number> = {}
      const countedEncounterIds = new Set<number>()

      // Build appointment -> patient map first, so encounters linked only by appointment_id
      // are still counted in visit totals.
      try {
        const { data: appointmentsForEncounters } = await supabase
          .from('appointments')
          .select('id, patient_id')
          .in('patient_id', patientIds)

        if (appointmentsForEncounters) {
          appointmentsForEncounters.forEach((appointment) => {
            if (appointment?.id && appointment?.patient_id) {
              appointmentToPatient[appointment.id] = appointment.patient_id
            }
          })
        }
      } catch {
        // Continue without appointment map fallback
      }

      try {
        const { data: encountersData } = await supabase
          .from('encounters')
          .select('id, patient_id, appointment_id, created_at')
          .or(
            `patient_id.in.(${patientIds.join(',')}),appointment_id.in.(${Object.keys(appointmentToPatient).join(',') || '-1'})`
          )

        if (encountersData) {
          encountersData.forEach(encounter => {
            const resolvedPatientId =
              encounter.patient_id ?? (encounter.appointment_id ? appointmentToPatient[encounter.appointment_id] : undefined)

            if (!resolvedPatientId || !patientIds.includes(resolvedPatientId)) return
            if (countedEncounterIds.has(encounter.id)) return

            countedEncounterIds.add(encounter.id)
            encounterCounts[resolvedPatientId] = (encounterCounts[resolvedPatientId] || 0) + 1
            if (!encounterLastVisits[resolvedPatientId] || encounter.created_at > encounterLastVisits[resolvedPatientId]) {
              encounterLastVisits[resolvedPatientId] = encounter.created_at
            }
          })
        }
      } catch {
        // Continue without encounter counts
      }

      try {
        const { data: appointmentsData } = await supabase
          .from('appointments')
          .select('patient_id, appointment_date, appointment_time')
          .in('patient_id', patientIds)

        if (appointmentsData) {
          appointmentsData.forEach(appointment => {
            if (!appointment.patient_id || !appointment.appointment_date) return
            const dateTimeString = appointment.appointment_time
              ? `${appointment.appointment_date}T${appointment.appointment_time}`
              : appointment.appointment_date

            const existing = appointmentLastVisits[appointment.patient_id]
            if (!existing || new Date(dateTimeString).getTime() > new Date(existing).getTime()) {
              appointmentLastVisits[appointment.patient_id] = dateTimeString
            }
          })
        }
      } catch {
        // Continue without appointment-based last visits
      }

      const mappedPatients = patientsData.map(patient => {
        const encounterDate = encounterLastVisits[patient.id] || null
        const appointmentDate = appointmentLastVisits[patient.id] || null

        let lastVisit: string | null = null
        if (encounterDate && appointmentDate) {
          lastVisit =
            new Date(encounterDate).getTime() >= new Date(appointmentDate).getTime()
              ? encounterDate
              : appointmentDate
        } else {
          lastVisit = encounterDate || appointmentDate || null
        }

        return {
          ...patient,
          encounter_count: encounterCounts[patient.id] || 0,
          last_visit: lastVisit,
        }
      }) as Patient[]

      // Client-side sort for current page (encounter_count, last_visit need post-fetch)
      const sorted = [...mappedPatients]
      switch (sortBy) {
        case 'name':
          sorted.sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`))
          break
        case 'recent':
          sorted.sort((a, b) => {
            if (!a.last_visit && !b.last_visit) return 0
            if (!a.last_visit) return 1
            if (!b.last_visit) return -1
            return new Date(b.last_visit).getTime() - new Date(a.last_visit).getTime()
          })
          break
        case 'visits':
          sorted.sort((a, b) => (b.encounter_count || 0) - (a.encounter_count || 0))
          break
      }
      setPatients(sorted)
    } catch (error) {
      console.error('Error in fetchPatients:', error)
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'PatientsHistoryPage', action: 'fetchPatients' },
      })
      setPatients([])
    } finally {
      setLoading(false)
    }
  }, [supabase, debouncedSearch, filterGender, page, sortBy])

  // Fetch when page, search, filters, or sort change
  useEffect(() => {
    if (!user || (role !== 'doctor' && role !== 'nurse' && role !== 'staff')) return
    const searchOrFilterChanged = debouncedSearch !== prevSearchRef.current || filterGender !== prevFilterRef.current
    if (searchOrFilterChanged) {
      prevSearchRef.current = debouncedSearch
      prevFilterRef.current = filterGender
      setPage(1)
      fetchPatients(1)
    } else {
      fetchPatients()
    }
  }, [user, role, debouncedSearch, filterGender, page, sortBy, fetchPatients])

  const handleRefresh = () => {
    setPage(1)
    fetchPatients(1)
  }

  const totalPages = Math.ceil((totalPatientCount ?? 0) / PAGE_SIZE) || 1

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const calculateAge = (dob: string | null) => {
    if (!dob) return 'N/A'
    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-1">{t('patients.title')}</h1>
              <p className="text-slate-500 text-sm">
                {t('patients.subtitle')}
              </p>
            </div>
            {totalPatientCount !== null && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3">
                <p className="text-emerald-700 text-xs font-medium">{t('patients.db_connected')}</p>
                <p className="text-slate-900 text-2xl font-bold leading-tight">{totalPatientCount}</p>
                <p className="text-emerald-600 text-xs">{t('patients.total_patients')}</p>
              </div>
            )}
          </div>
        </div>

        <>
        {/* Search and Filters */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-5">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('patients.search_placeholder')}
                className="w-full pl-10 pr-4 h-11 bg-[#f9fbff] border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] focus:border-transparent"
              />
            </div>

            <button
              onClick={handleRefresh}
              disabled={loading}
              className="h-11 w-11 inline-flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title={t('common.refresh')}
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs font-medium whitespace-nowrap">{t('patients.sort_by')}</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] cursor-pointer"
              >
                <option value="name">{t('patients.sort_name')}</option>
                <option value="recent">{t('patients.sort_recent')}</option>
                <option value="visits">{t('patients.sort_visits')}</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs font-medium whitespace-nowrap">{t('patients.gender')}</span>
              <select
                value={filterGender}
                onChange={(e) => setFilterGender(e.target.value as typeof filterGender)}
                className="h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3] cursor-pointer"
              >
                <option value="all">{t('common.all')}</option>
                <option value="Male">{t('common.male')}</option>
                <option value="Female">{t('common.female')}</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {t('patients.showing_x_of_y', {
                start: patients.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
                end: Math.min(page * PAGE_SIZE, totalPatientCount ?? 0),
                total: totalPatientCount ?? 0,
              })}
              {debouncedSearch.trim() && ` ${t('patients.search_on_all')}`}
            </p>
            {searchQuery.trim() && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-[#2E6EF3] hover:text-[#1f5ad2] font-medium transition-colors"
              >
                {t('common.clear_search')}
              </button>
            )}
          </div>
        </div>

        {/* Patients Table */}
        {loading && patients.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 flex items-center justify-center">
            <LoadingSpinner message={t('patients.loading')} />
          </div>
        ) : patients.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 bg-[#2E6EF3]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {searchQuery ? t('common.no_results') : t('patients.no_patients')}
            </h3>
            <p className="text-slate-500 text-sm">
              {searchQuery ? t('common.try_adjust_filters') : t('patients.empty_message')}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <div className="col-span-3">{t('patients.col_patient')}</div>
              <div className="col-span-2">{t('patients.col_contact')}</div>
              <div className="col-span-2">{t('patients.col_demographics')}</div>
              <div className="col-span-2">{t('patients.col_last_visit')}</div>
              <div className="col-span-1 text-center">{t('patients.col_visits')}</div>
              <div className="col-span-2 text-right">{t('common.actions')}</div>
            </div>

            <div className="divide-y divide-slate-100">
              {patients.map((patient) => (
                <div
                  key={patient.id}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-4 px-6 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="lg:col-span-3 flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#2E6EF3] rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                      {patient.first_name.charAt(0)}{patient.last_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-slate-900 font-semibold text-sm truncate">
                        {patient.first_name} {patient.last_name}
                      </h3>
                      <p className="text-slate-400 text-xs font-mono">{t('common.id')}: {patient.id}</p>
                    </div>
                  </div>

                  <div className="lg:col-span-2 flex flex-col justify-center min-w-0">
                    <p className="text-slate-700 text-sm truncate">{patient.email || t('common.no_email')}</p>
                    <p className="text-slate-500 text-xs">{patient.phone || t('common.no_phone')}</p>
                  </div>

                  <div className="lg:col-span-2 flex flex-col justify-center">
                    <p className="text-slate-700 text-sm">
                      {patient.gender ? (patient.gender === 'Male' ? t('common.male') : patient.gender === 'Female' ? t('common.female') : patient.gender) : 'N/A'}, {calculateAge(patient.date_of_birth)} {t('patients.years_short')}
                    </p>
                    <p className="text-slate-500 text-xs">{t('common.dob')}: {formatDate(patient.date_of_birth)}</p>
                  </div>

                  <div className="lg:col-span-2 flex items-center">
                    <span className={`text-sm ${patient.last_visit ? 'text-slate-700' : 'text-slate-400'}`}>
                      {patient.last_visit ? formatDate(patient.last_visit) : t('patients.no_visits')}
                    </span>
                  </div>

                  <div className="lg:col-span-1 flex items-center justify-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      (patient.encounter_count || 0) > 5 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : (patient.encounter_count || 0) > 0 
                        ? 'bg-[#2E6EF3]/10 text-[#2E6EF3] border border-[#2E6EF3]/20'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      {patient.encounter_count || 0}
                    </span>
                  </div>

                  <div className="lg:col-span-2 flex items-center justify-end gap-2">
                    <Link
                      href={`/patient-file/${patient.id.toString()}`}
                      className="px-3.5 py-2 bg-[#2E6EF3] text-white rounded-lg text-xs font-semibold hover:bg-[#1f5ad2] transition-colors"
                    >
                      {t('common.view_file')}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pagination */}
        {!loading && patients.length > 0 && (
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

        {/* Stats Cards */}
        {!loading && totalPatientCount !== null && totalPatientCount > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('patients.total_patients')}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{totalPatientCount}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('patients.on_this_page')}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{patients.length}</p>
            </div>
          </div>
        )}
        </>
      </div>
    </div>
  )
}

export default withRoleProtection(PatientsHistoryPage, {
  allowedRoles: [UserRole.DOCTOR, UserRole.NURSE, UserRole.STAFF],
  redirectTo: '/dashboard',
})
