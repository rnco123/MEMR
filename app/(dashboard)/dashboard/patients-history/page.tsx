'use client'

import { useAuth } from '@/lib/auth-context'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { UserRole } from '@/lib/roles'
import * as Sentry from '@sentry/nextjs'

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

  // Build base query with search (searches ALL patients) and gender filter
  const buildQuery = useCallback(
    (base: ReturnType<ReturnType<typeof createClient>['from']>) => {
      let q = base
      const trimmed = debouncedSearch.trim()
      if (trimmed) {
        const term = `%${trimmed}%`
        const numTerm = parseInt(trimmed, 10)
        if (!isNaN(numTerm)) {
          q = q.or(
            `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term},id.eq.${numTerm}`
          )
        } else {
          q = q.or(
            `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`
          )
        }
      }
      if (filterGender !== 'all') {
        q = q.eq('gender', filterGender)
      }
      return q
    },
    [debouncedSearch, filterGender]
  )

  // Fetch patients for current page (search applies to ALL records)
  const fetchPatients = useCallback(async (pageOverride?: number) => {
    const pageToUse = pageOverride ?? page
    try {
      setLoading(true)
      const from = (pageToUse - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      let query = supabase
        .from('patients')
        .select('id, first_name, last_name, email, phone, date_of_birth, gender, created_at')
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
        .range(from, to)

      query = buildQuery(query)
      const { data: patientsData, error: patientsError } = await query

      if (patientsError) {
        console.error('Error fetching patients:', patientsError)
        Sentry.captureException(patientsError, {
          tags: { component: 'PatientsHistoryPage', action: 'fetchPatients' },
        })
        setPatients([])
        return
      }

      // Fetch total count with same filters (search on all)
      const countQuery = buildQuery(supabase.from('patients').select('id', { count: 'exact', head: true }))
      const { count, error: countError } = await countQuery
      setTotalPatientCount(countError ? null : (count ?? 0))

      if (!patientsData || patientsData.length === 0) {
        setPatients([])
        return
      }

      const patientIds = patientsData.map(p => p.id)
      const encounterCounts: Record<number, number> = {}
      const lastVisits: Record<number, string> = {}

      try {
        const { data: encountersData } = await supabase
          .from('encounters')
          .select('patient_id, created_at')
          .in('patient_id', patientIds)

        if (encountersData) {
          encountersData.forEach(encounter => {
            const patientId = encounter.patient_id
            encounterCounts[patientId] = (encounterCounts[patientId] || 0) + 1
            if (!lastVisits[patientId] || encounter.created_at > lastVisits[patientId]) {
              lastVisits[patientId] = encounter.created_at
            }
          })
        }
      } catch {
        // Continue without counts
      }

      const mappedPatients = patientsData.map(patient => ({
        ...patient,
        encounter_count: encounterCounts[patient.id] || 0,
        last_visit: lastVisits[patient.id] || null,
      })) as Patient[]

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
  }, [supabase, buildQuery, page, sortBy])

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
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Patients History</h1>
              <p className="text-blue-200">
                Complete clinic patient records and medical history
              </p>
            </div>
            {totalPatientCount !== null && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl px-6 py-3">
                <p className="text-green-300 text-sm font-medium">Database Connected</p>
                <p className="text-white text-2xl font-bold">{totalPatientCount}</p>
                <p className="text-green-200 text-xs">Total Patients</p>
              </div>
            )}
          </div>
        </div>

        {/* Patients Content */}
        <>
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
                placeholder="Search by name, email, phone, or patient ID..."
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white hover:bg-white/20 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <span className="text-blue-200 text-sm whitespace-nowrap">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="name">Name (A-Z)</option>
                <option value="recent">Recent Visit</option>
                <option value="visits">Most Visits</option>
              </select>
            </div>

            {/* Gender Filter */}
            <div className="flex items-center gap-2">
              <span className="text-blue-200 text-sm whitespace-nowrap">Gender:</span>
              <select
                value={filterGender}
                onChange={(e) => setFilterGender(e.target.value as typeof filterGender)}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>

          {/* Results count */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-blue-200">
              Showing{' '}
              <span className="text-white font-medium">
                {patients.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, totalPatientCount ?? 0)}
              </span>{' '}
              of <span className="text-white font-medium">{totalPatientCount ?? 0}</span> patients
              {debouncedSearch.trim() && ' (search on all)'}
            </p>
            {searchQuery.trim() && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-sm text-blue-300 hover:text-white transition-colors"
              >
                Clear search
              </button>
            )}
          </div>
        </div>

        {/* Patients Table */}
        {loading && patients.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner message="Loading patients..." />
          </div>
        ) : patients.length === 0 ? (
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-12 text-center">
            <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              {searchQuery ? 'No Results Found' : 'No Patients Found'}
            </h3>
            <p className="text-blue-200">
              {searchQuery ? 'Try adjusting your search or filters.' : 'No patients have been registered in the clinic yet.'}
            </p>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
            {/* Table Header */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-6 py-4 bg-white/5 border-b border-white/10 text-sm font-medium text-blue-200">
              <div className="col-span-3">Patient</div>
              <div className="col-span-2">Contact</div>
              <div className="col-span-2">Demographics</div>
              <div className="col-span-2">Last Visit</div>
              <div className="col-span-1 text-center">Visits</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-white/10">
              {patients.map((patient) => (
                <div
                  key={patient.id}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-4 px-6 py-4 hover:bg-white/5 transition-colors"
                >
                  {/* Patient Info */}
                  <div className="lg:col-span-3 flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                      {patient.first_name.charAt(0)}{patient.last_name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">
                        {patient.first_name} {patient.last_name}
                      </h3>
                      <p className="text-blue-300 text-xs font-mono">ID: {patient.id}</p>
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="lg:col-span-2 flex flex-col justify-center">
                    <p className="text-white text-sm truncate">{patient.email || 'No email'}</p>
                    <p className="text-blue-200 text-sm">{patient.phone || 'No phone'}</p>
                  </div>

                  {/* Demographics */}
                  <div className="lg:col-span-2 flex flex-col justify-center">
                    <p className="text-white text-sm">
                      {patient.gender || 'N/A'}, {calculateAge(patient.date_of_birth)} yrs
                    </p>
                    <p className="text-blue-200 text-sm">DOB: {formatDate(patient.date_of_birth)}</p>
                  </div>

                  {/* Last Visit */}
                  <div className="lg:col-span-2 flex items-center">
                    <span className={`text-sm ${patient.last_visit ? 'text-white' : 'text-blue-300'}`}>
                      {patient.last_visit ? formatDate(patient.last_visit) : 'No visits yet'}
                    </span>
                  </div>

                  {/* Visit Count */}
                  <div className="lg:col-span-1 flex items-center justify-center">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      (patient.encounter_count || 0) > 5 
                        ? 'bg-green-500/20 text-green-300' 
                        : (patient.encounter_count || 0) > 0 
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-white/10 text-blue-200'
                    }`}>
                      {patient.encounter_count || 0}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="lg:col-span-2 flex items-center justify-end gap-2">
                    <Link
                      href={`/patient-file/${patient.id.toString()}`}
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:from-blue-600 hover:to-cyan-600 transition-all"
                    >
                      View File
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pagination */}
        {!loading && patients.length > 0 && (
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

        {/* Stats Cards */}
        {!loading && totalPatientCount !== null && totalPatientCount > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl p-4">
              <p className="text-blue-200 text-sm">Total Patients</p>
              <p className="text-2xl font-bold text-white">{totalPatientCount}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl p-4">
              <p className="text-blue-200 text-sm">On This Page</p>
              <p className="text-2xl font-bold text-white">{patients.length}</p>
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
