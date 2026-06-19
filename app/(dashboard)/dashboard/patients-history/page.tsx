'use client'

import { useAuth } from '@/lib/auth-context'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { FULL_CLINICAL_DASHBOARD_ROLES, isPhysicianRole } from '@/lib/roles'
import * as Sentry from '@sentry/nextjs'
import { useT } from '@/lib/i18n'
import { useUserLocations } from '@/lib/hooks/use-user-locations'
import { LocationFilterSelect } from '@/components/LocationFilterSelect'
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader'
import { SearchByDobDropdowns } from '@/components/SearchByDobDropdowns'
import { parseSearchDateToIso } from '@/lib/nurse/patient-search-query'

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
  location_id?: number | null
  location_title?: string | null
}

const PAGE_SIZE = 10

function PatientsHistoryPage() {
  const { user, role } = useAuth()
  const { t } = useT()
  const {
    locations: userLocations,
    unrestricted: locationsUnrestricted,
    selectedLocationId,
    setSelectedLocationId,
  } = useUserLocations()
  const [patients, setPatients] = useState<Patient[]>([])
  const [totalPatientCount, setTotalPatientCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'visits'>('name')
  const [filterGender, setFilterGender] = useState<'all' | 'Male' | 'Female'>('all')
  const [searchMode, setSearchMode] = useState<'name' | 'dob'>('name')
  const [dobYear, setDobYear] = useState('')
  const [dobMonth, setDobMonth] = useState('')
  const [dobDay, setDobDay] = useState('')
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
      const params = new URLSearchParams({
        page: String(pageToUse),
        search: debouncedSearch.trim(),
        gender: filterGender,
        sort: sortBy,
      })
      if (selectedLocationId !== 'all') {
        params.set('location_id', String(selectedLocationId))
      }
      if (searchMode === 'dob') {
        if (dobYear) params.set('dob_year', dobYear)
        if (dobMonth) params.set('dob_month', dobMonth)
        if (dobDay) params.set('dob_day', dobDay)
      } else {
        // Auto-detect date pattern in text search
        const detected = parseSearchDateToIso(debouncedSearch.trim())
        if (detected) params.set('search', detected)
      }
      const res = await fetch(`/api/clinical/patients-history?${params}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error ?? 'Failed to load patients')
      }
      setPatients((json.rows ?? []) as Patient[])
      setTotalPatientCount(json.total ?? 0)
    } catch (error) {
      console.error('Error in fetchPatients:', error)
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'PatientsHistoryPage', action: 'fetchPatients' },
      })
      setPatients([])
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, filterGender, page, sortBy, selectedLocationId, searchMode, dobYear, dobMonth, dobDay])

  // Fetch when page, search, filters, or sort change
  useEffect(() => {
    if (!user || (!isPhysicianRole(role) && role !== 'nurse')) return
    const searchOrFilterChanged =
      debouncedSearch !== prevSearchRef.current ||
      filterGender !== prevFilterRef.current ||
      searchMode === 'dob'
    if (searchOrFilterChanged) {
      prevSearchRef.current = debouncedSearch
      prevFilterRef.current = filterGender
      setPage(1)
      fetchPatients(1)
    } else {
      fetchPatients()
    }
  }, [user, role, debouncedSearch, filterGender, page, sortBy, selectedLocationId, fetchPatients, searchMode, dobYear, dobMonth, dobDay])

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
    <div className="flex flex-col min-h-0">
      {/* ── Mobile app header ── */}
      <MobilePageHeader
        title={t('patients.title')}
        subtitle={totalPatientCount !== null ? `${totalPatientCount} ${t('patients.total_patients')}` : undefined}
        actions={
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        }
      />

      {/* ── Mobile search bar ── */}
      <div className="lg:hidden px-4 py-3 bg-white border-b border-slate-100 space-y-2">
        {/* Mode toggle */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setSearchMode('name')}
            className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors ${searchMode === 'name' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            Name / Phone
          </button>
          <button
            type="button"
            onClick={() => setSearchMode('dob')}
            className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors ${searchMode === 'dob' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            Date of Birth
          </button>
        </div>
        <div className="flex gap-2">
          {searchMode === 'name' ? (
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('patients.search_placeholder')}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-[#f9fbff] text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
              />
            </div>
          ) : (
            <div className="flex-1">
              <SearchByDobDropdowns
                year={dobYear}
                month={dobMonth}
                day={dobDay}
                onYearChange={setDobYear}
                onMonthChange={setDobMonth}
                onDayChange={setDobDay}
                layout="compact"
              />
            </div>
          )}
          <select
            value={filterGender}
            onChange={(e) => setFilterGender(e.target.value as typeof filterGender)}
            className="h-10 shrink-0 px-2.5 rounded-xl border border-slate-200 bg-[#f9fbff] text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
          >
            <option value="all">{t('common.all')}</option>
            <option value="Male">{t('common.male')}</option>
            <option value="Female">{t('common.female')}</option>
          </select>
        </div>
      </div>

      {/* ── Mobile patient list ── */}
      <div className="lg:hidden flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-2.5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {loading && patients.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner message={t('patients.loading')} />
          </div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 bg-[#2E6EF3]/10 rounded-2xl flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-[#2E6EF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="font-semibold text-slate-900">{searchQuery ? t('common.no_results') : t('patients.no_patients')}</p>
          </div>
        ) : (
          <>
            {patients.map((patient) => (
              <Link
                key={patient.id}
                href={`/patient-file/${patient.id.toString()}`}
                className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-4 active:scale-[0.98] transition-transform"
              >
                <div className="w-11 h-11 shrink-0 bg-[#2E6EF3] rounded-xl flex items-center justify-center text-white font-semibold text-sm">
                  {patient.first_name.charAt(0)}{patient.last_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{patient.first_name} {patient.last_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {patient.gender && `${patient.gender === 'Male' ? t('common.male') : patient.gender === 'Female' ? t('common.female') : patient.gender} · `}
                    {calculateAge(patient.date_of_birth)} {t('patients.years_short')}
                    {patient.encounter_count ? ` · ${patient.encounter_count} visits` : ''}
                  </p>
                  {patient.phone && <p className="text-xs text-slate-400 mt-0.5">{patient.phone}</p>}
                </div>
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
            {/* Mobile pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 disabled:opacity-40"
                >
                  {t('common.previous')}
                </button>
                <span className="text-sm text-slate-500">{t('common.page_x_of_y', { page, total: totalPages })}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 disabled:opacity-40"
                >
                  {t('common.next')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Desktop view (unchanged) ── */}
      <div className="hidden lg:block p-6 lg:p-8">
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
            {/* Search mode toggle + input */}
            <div className="flex-1 flex gap-2 items-center">
              {/* Mode pills */}
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setSearchMode('name')}
                  className={`h-9 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${searchMode === 'name' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Name / Phone
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode('dob')}
                  className={`h-9 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${searchMode === 'dob' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Date of Birth
                </button>
              </div>
              {searchMode === 'name' ? (
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
              ) : (
                <div className="flex-1">
                  <SearchByDobDropdowns
                    year={dobYear}
                    month={dobMonth}
                    day={dobDay}
                    onYearChange={setDobYear}
                    onMonthChange={setDobMonth}
                    onDayChange={setDobDay}
                    layout="compact"
                  />
                </div>
              )}
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
              <span className="text-slate-500 text-xs font-medium whitespace-nowrap">{t('location.filter_label')}</span>
              <LocationFilterSelect
                locations={userLocations}
                value={selectedLocationId}
                onChange={(v) => {
                  setSelectedLocationId(v)
                  setPage(1)
                }}
                unrestricted={locationsUnrestricted}
                className="h-11"
              />
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
                    {patient.location_title ? (
                      <p className="text-slate-500 text-xs mt-0.5">{t('location.column')}: {patient.location_title}</p>
                    ) : null}
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
      </div>{/* end hidden lg:block */}
    </div>
  )
}

export default withRoleProtection(PatientsHistoryPage, {
  allowedRoles: [...FULL_CLINICAL_DASHBOARD_ROLES],
  redirectTo: '/dashboard',
})
