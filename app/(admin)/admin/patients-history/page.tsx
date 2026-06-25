'use client'

import { LoadingSpinner } from '@/components/LoadingSpinner'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useT } from '@/lib/i18n'
import { SmartPatientSearchInput } from '@/components/SmartPatientSearchInput'
import { useAiPatientSearchParse } from '@/lib/hooks/use-ai-patient-search-parse'
import { patientMatchesParsedSearch } from '@/lib/nurse/patient-search-apply'

type Patient = {
  id: number
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
  gender?: string | null
  created_at: string
  encounter_count?: number
  last_visit?: string | null
}

const PAGE_SIZE = 10

export default function AdminPatientsHistoryPage() {
  const { t, language } = useT()
  const localeTag = language === 'es' ? 'es-ES' : 'en-US'
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const { parsed: parsedSearch, isPending: searchPending, debouncedQuery } =
    useAiPatientSearchParse(searchQuery)

  const fetchPatients = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/patients-history', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load patients')
      setPatients(json.rows ?? [])
    } catch {
      setPatients([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchPatients()
  }, [])

  const filteredPatients = useMemo(() => {
    let result = [...patients]
    const activeParsed =
      parsedSearch && parsedSearch.raw === debouncedQuery.trim() ? parsedSearch : null
    if (activeParsed) {
      result = result.filter((patient) => patientMatchesParsedSearch(patient, activeParsed))
    }

    result.sort((a, b) => {
      if (!a.last_visit && !b.last_visit) return 0
      if (!a.last_visit) return 1
      if (!b.last_visit) return -1
      return new Date(b.last_visit).getTime() - new Date(a.last_visit).getTime()
    })

    return result
  }, [patients, parsedSearch, debouncedQuery])

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery])

  const paginatedPatients = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredPatients.slice(start, start + PAGE_SIZE)
  }, [filteredPatients, page])

  const totalPages = Math.ceil(filteredPatients.length / PAGE_SIZE) || 1

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return t('common.na')
    return new Date(dateString).toLocaleDateString(localeTag, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const calculateAge = (dob: string | null) => {
    if (!dob) return t('common.na')
    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--
    return age
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">{t('admin.patients.title')}</h1>
            <p className="text-slate-500 text-sm">{t('admin.patients.subtitle')}</p>
          </div>
          {!loading && filteredPatients.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
              >
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
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('patients.total_patients')}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{patients.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{t('patients.on_this_page')}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{paginatedPatients.length}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <SmartPatientSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('admin.patients.search')}
              loading={searchPending}
            />
            <button
              onClick={() => void fetchPatients()}
              disabled={loading}
              className="h-11 w-11 inline-flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title={t('common.refresh')}
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {loading && patients.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 flex items-center justify-center">
            <LoadingSpinner message={t('patients.loading')} />
          </div>
        ) : paginatedPatients.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">{t('patients.no_patients')}</h3>
            <p className="text-slate-500 text-sm">{t('admin.patients.no_patients_sub')}</p>
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
              {paginatedPatients.map((patient) => (
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
                      <p className="text-slate-400 text-xs font-mono">ID: {patient.id}</p>
                    </div>
                  </div>

                  <div className="lg:col-span-2 flex flex-col justify-center min-w-0">
                    <p className="text-slate-700 text-sm truncate">{patient.email || t('common.no_email')}</p>
                    <p className="text-slate-500 text-xs">{patient.phone || t('common.no_phone')}</p>
                  </div>

                  <div className="lg:col-span-2 flex flex-col justify-center">
                    <p className="text-slate-700 text-sm">
                      {patient.gender === 'Male' ? t('common.male') : patient.gender === 'Female' ? t('common.female') : patient.gender || t('common.na')}, {calculateAge(patient.date_of_birth)}{t('patients.years_short')}
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
                      href={`/admin/patient-file/${patient.id.toString()}`}
                      className="px-3.5 py-2 bg-[#2E6EF3] text-white rounded-lg text-xs font-semibold hover:bg-[#1f5ad2] transition-colors"
                    >
                      {t('admin.patients.view_file')}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && filteredPatients.length > 0 && (
          <p className="text-xs text-slate-500 mb-4">
            {t('patients.showing_x_of_y', {
              start: (page - 1) * PAGE_SIZE + 1,
              end: Math.min(page * PAGE_SIZE, filteredPatients.length),
              total: filteredPatients.length,
            })}
            {debouncedQuery.trim()
              ? ` ${t('admin.patients.filtered_from', { total: patients.length })}`
              : ''}
          </p>
        )}
      </div>
    </div>
  )
}
