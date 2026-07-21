'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { SearchByDobDropdowns } from '@/components/SearchByDobDropdowns'
import { useT } from '@/lib/i18n'
import { calculateAgeFromDob } from '@/lib/nurse/walk-in-intake'
import { emptyIntakeFormInput, intakeRowToFormInput } from '@/lib/intake/intake-form-mappers'
import { IntakeFormFields } from '@/components/IntakeFormFields'
import { PatientSourceBadge } from '@/components/PatientSourceBadge'
import type { NurseWalkInIntakeInput } from '@/lib/validation'
import { phoneDigitsOnly } from '@/lib/phone-digits'
import { normalizePharmacyRow, type PharmacyRecord } from '@/lib/pharmacies/normalize'
import { formatDobShort } from '@/lib/datetime/date-input'
import {
  formatClinicDateOnly,
  formatClinicTimeSlot,
  getClinicCurrentTimeString,
  getClinicTodayDateString,
} from '@/lib/datetime/clinic-timezone'

type PatientRow = {
  id: number
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
  gender: string | null
  street_address: string | null
  state: string | null
  zip_code: string | null
  location_id: number | null
  location_title: string | null
  created_by_source?: string | null
}

type ServiceRow = { id: number; title_en: string; title_es?: string | null }

type Step = 'search' | 'select' | 'form'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]'
const READONLY = `${INPUT} bg-slate-50 text-slate-600 cursor-not-allowed`
const SECTION = 'text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3'

function getTodayDate() {
  return getClinicTodayDateString()
}

function getCurrentTime() {
  return getClinicCurrentTimeString()
}

function isFutureAppointmentDate(date: string) {
  return date.trim().slice(0, 10) > getClinicTodayDateString()
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onCreated: (result: {
    appointmentId: number
    encounterId: number
    patientId: number
    isFuture: boolean
  }) => void
  defaultLocationId?: number | null
}

export function NurseAddEncounterModal({ isOpen, onClose, onCreated, defaultLocationId }: Props) {
  const { t, language } = useT()
  const [step, setStep] = useState<Step>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [dobYear, setDobYear] = useState('')
  const [dobMonth, setDobMonth] = useState('')
  const [dobDay, setDobDay] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<PatientRow[]>([])
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null)

  const [services, setServices] = useState<ServiceRow[]>([])
  const [pharmacies, setPharmacies] = useState<PharmacyRecord[]>([])
  const [optionsLoading, setOptionsLoading] = useState(false)

  const [appointmentDate, setAppointmentDate] = useState(getTodayDate)
  const [appointmentTime, setAppointmentTime] = useState(getCurrentTime)
  const [serviceId, setServiceId] = useState('')
  const [onsiteType, setOnsiteType] = useState<'onsite' | 'telemedicine'>('onsite')
  const [pharmacyId, setPharmacyId] = useState('')
  const [pharmacyQuery, setPharmacyQuery] = useState('')
  const [showManualPharmacy, setShowManualPharmacy] = useState(false)
  const [manualPharmacy, setManualPharmacy] = useState({ name: '', address: '', phone: '', email: '' })
  const [submitting, setSubmitting] = useState(false)
  const [showFutureConfirm, setShowFutureConfirm] = useState(false)
  const [intakeForm, setIntakeForm] = useState<NurseWalkInIntakeInput>(emptyIntakeFormInput())

  const resetForm = useCallback(() => {
    setStep('search')
    setSearchQuery('')
    setDobYear('')
    setDobMonth('')
    setDobDay('')
    setResults([])
    setSelectedPatient(null)
    setAppointmentDate(getTodayDate())
    setAppointmentTime(getCurrentTime())
    setServiceId('')
    setOnsiteType('onsite')
    setPharmacyId('')
    setPharmacyQuery('')
    setShowManualPharmacy(false)
    setManualPharmacy({ name: '', address: '', phone: '', email: '' })
    setIntakeForm(emptyIntakeFormInput())
    setShowFutureConfirm(false)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      resetForm()
      return
    }
    setOptionsLoading(true)
    fetch('/api/nurse/walk-in', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        setServices(json.services ?? [])
        setPharmacies(
          (json.pharmacies ?? []).map((row: Record<string, unknown>) => normalizePharmacyRow(row))
        )
        if (json.services?.[0]?.id) {
          setServiceId(String(json.services[0].id))
        }
      })
      .catch(() => toast.error(t('nurse_walkin.options_failed')))
      .finally(() => setOptionsLoading(false))
  }, [isOpen, resetForm, t])

  // Preload every patient in the nurse's assigned location(s) when the modal opens.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setSearching(true)
    const preloadParams = new URLSearchParams()
    if (defaultLocationId != null) preloadParams.set('location_id', String(defaultLocationId))
    fetch(`/api/nurse/patient-search?${preloadParams}`, { credentials: 'include' })
      .then((r) => r.json().catch(() => ({})))
      .then((json) => {
        if (cancelled) return
        const patients = (json.patients ?? []) as PatientRow[]
        setResults(patients)
        if (patients.length > 0) setStep('select')
      })
      .catch(() => {
        // Silent — the nurse can still search manually.
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, defaultLocationId])

  const runSearch = useCallback(
    async (opts?: { showAll?: boolean }) => {
      const showAllMode = opts?.showAll ?? false
      const trimmedSearch = showAllMode ? '' : searchQuery.trim()
      const yearParam = showAllMode ? '' : dobYear
      const monthParam = showAllMode ? '' : dobMonth
      const dayParam = showAllMode ? '' : dobDay
      const hasDob = Boolean(yearParam || monthParam || dayParam)
      // Empty criteria → "show all patients in my location" instead of erroring.
      const effectiveShowAll = showAllMode || (!trimmedSearch && !hasDob)

      setSearching(true)
      try {
        const params = new URLSearchParams()
        if (trimmedSearch) params.set('search', trimmedSearch)
        if (yearParam) params.set('dob_year', yearParam)
        if (monthParam) params.set('dob_month', monthParam)
        if (dayParam) params.set('dob_day', dayParam)
        if (defaultLocationId != null) params.set('location_id', String(defaultLocationId))
        const res = await fetch(`/api/nurse/patient-search?${params}`, { credentials: 'include' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(
            (json as { error?: string; message?: string }).error ||
              (json as { message?: string }).message ||
              t('nurse_walkin.search_failed')
          )
        }
        const patients = (json.patients ?? []) as PatientRow[]
        setResults(patients)
        if (patients.length === 0) {
          toast.message(effectiveShowAll ? t('nurse_walkin.no_patients_location') : t('nurse_walkin.no_patients'))
          setStep('search')
        } else if (!effectiveShowAll && patients.length === 1) {
          setSelectedPatient(patients[0]!)
          setStep('form')
        } else {
          setStep('select')
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('nurse_walkin.search_failed'))
      } finally {
        setSearching(false)
      }
    },
    [searchQuery, dobYear, dobMonth, dobDay, defaultLocationId, t]
  )

  const selectPatient = (p: PatientRow) => {
    setSelectedPatient(p)
    setIntakeForm(emptyIntakeFormInput())
    setStep('form')
  }

  useEffect(() => {
    if (!selectedPatient || step !== 'form') return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/patients/${selectedPatient.id}/clinical-history`, {
          credentials: 'include',
        })
        const json = await res.json().catch(() => ({}))
        if (cancelled || !res.ok || !json.latest_intake) return
        const prefill = intakeRowToFormInput(json.latest_intake as Record<string, unknown>)
        setIntakeForm((prev) => (Object.keys(prev).length > 0 ? prev : prefill))
      } catch {
        // Prefill is optional.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedPatient, step])

  const filteredPharmacies = useMemo(() => {
    const q = pharmacyQuery.trim().toLowerCase()
    if (!q) return pharmacies
    return pharmacies.filter((p) => {
      const blob = [p.name, p.address, p.phone, p.email, String(p.id)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [pharmacies, pharmacyQuery])

  const patientAddress = useMemo(() => {
    if (!selectedPatient) return ''
    return [selectedPatient.street_address, selectedPatient.state, selectedPatient.zip_code]
      .filter(Boolean)
      .join(', ')
  }, [selectedPatient])

  const addManualPharmacy = async () => {
    if (!manualPharmacy.name.trim()) {
      toast.error(t('pharmacies.name_req'))
      return
    }
    try {
      const res = await fetch('/api/pharmacies/registry', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: manualPharmacy.name.trim(),
          address: manualPharmacy.address.trim() || null,
          phone: manualPharmacy.phone.trim() || null,
          email: manualPharmacy.email.trim() || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed')
      const created = normalizePharmacyRow(json.data as Record<string, unknown>)
      setPharmacies((prev) => [...prev, created])
      setPharmacyId(String(created.id))
      setShowManualPharmacy(false)
      setManualPharmacy({ name: '', address: '', phone: '', email: '' })
      toast.success(t('nurse_walkin.pharmacy_added'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_create_failed'))
    }
  }

  const submitWalkIn = async () => {
    if (!selectedPatient) return
    if (!appointmentDate) {
      toast.error(t('nurse_walkin.date_required'))
      return
    }
    const isFuture = isFutureAppointmentDate(appointmentDate)
    setSubmitting(true)
    try {
      const res = await fetch('/api/nurse/walk-in', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          service_id: serviceId ? Number(serviceId) : undefined,
          location_id: defaultLocationId ?? selectedPatient.location_id,
          onsite_type: onsiteType,
          pharmacy_id: pharmacyId ? Number(pharmacyId) : null,
          intake: Object.keys(intakeForm).length > 0 ? intakeForm : undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || json.message || 'Failed')
      toast.success(isFuture ? t('nurse_walkin.created_future') : t('nurse_walkin.created'))
      onCreated({
        appointmentId: json.data.appointment_id,
        encounterId: json.data.encounter_id,
        patientId: json.data.patient_id,
        isFuture,
      })
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('nurse_walkin.create_failed'))
    } finally {
      setSubmitting(false)
      setShowFutureConfirm(false)
    }
  }

  const handleCreateClick = () => {
    if (!appointmentDate) {
      toast.error(t('nurse_walkin.date_required'))
      return
    }
    if (isFutureAppointmentDate(appointmentDate)) {
      setShowFutureConfirm(true)
      return
    }
    void submitWalkIn()
  }

  if (!isOpen) return null

  const serviceTitle = (s: ServiceRow) =>
    language === 'es' && s.title_es ? s.title_es : s.title_en

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-x-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t('nurse_walkin.title')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('nurse_walkin.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-5 space-y-6">
          {optionsLoading && step === 'search' ? (
            <div className="py-12 flex justify-center">
              <LoadingSpinner message={t('common.loading')} />
            </div>
          ) : null}

          {(step === 'search' || step === 'select') && !optionsLoading && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">{t('nurse_walkin.search_label')}</label>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('nurse_walkin.search_placeholder')}
                  className={`${INPUT} mt-1`}
                  onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
                />
              </div>
              <SearchByDobDropdowns
                layout="stacked"
                year={dobYear}
                month={dobMonth}
                day={dobDay}
                onYearChange={setDobYear}
                onMonthChange={setDobMonth}
                onDayChange={setDobDay}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void runSearch()}
                  disabled={searching}
                  className="h-10 px-5 rounded-xl bg-[#2E6EF3] text-white text-sm font-semibold hover:bg-[#1f5ad2] disabled:opacity-50"
                >
                  {searching ? t('common.loading') : t('nurse_walkin.search_btn')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setDobYear('')
                    setDobMonth('')
                    setDobDay('')
                    void runSearch({ showAll: true })
                  }}
                  disabled={searching}
                  className="text-sm font-medium text-[#2E6EF3] hover:underline disabled:opacity-50"
                >
                  {t('nurse_walkin.show_all')}
                </button>
              </div>

              {step === 'select' && results.length > 0 && (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  <p className="px-4 py-2 text-xs font-semibold text-slate-500 bg-slate-50">
                    {t('nurse_walkin.select_patient', { count: results.length })}
                  </p>
                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPatient(p)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
                    >
                      <p className="font-semibold text-slate-900 inline-flex items-center gap-2 flex-wrap">
                        <span>
                          {p.first_name} {p.last_name}
                        </span>
                        <PatientSourceBadge source={p.created_by_source} />
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatDobShort(p.date_of_birth) ?? '—'}
                        {p.email ? ` · ${p.email}` : ''}
                        {p.phone ? ` · ${p.phone}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'form' && selectedPatient && (
            <div className="space-y-6">
              <button
                type="button"
                onClick={() => {
                  setStep(results.length > 1 ? 'select' : 'search')
                  setSelectedPatient(null)
                }}
                className="text-sm text-[#2E6EF3] font-medium hover:underline"
              >
                ← {t('nurse_walkin.back_search')}
              </button>

              <section>
                <h3 className={SECTION}>{t('nurse_walkin.patient_info')}</h3>
                <p className="text-xs text-slate-500 mb-3">{t('nurse_walkin.patient_info_hint')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">{t('nurse_walkin.first_name')}</label>
                    <input readOnly value={selectedPatient.first_name} className={`${READONLY} mt-1`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">{t('nurse_walkin.last_name')}</label>
                    <input readOnly value={selectedPatient.last_name} className={`${READONLY} mt-1`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">{t('pharmacies.email')}</label>
                    <input readOnly value={selectedPatient.email ?? ''} className={`${READONLY} mt-1`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">{t('nurse_walkin.mobile')}</label>
                    <input readOnly value={selectedPatient.phone ?? ''} className={`${READONLY} mt-1`} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-500">{t('pharmacies.address')}</label>
                    <input readOnly value={patientAddress} className={`${READONLY} mt-1`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">{t('nurse_walkin.gender')}</label>
                    <input readOnly value={selectedPatient.gender ?? '—'} className={`${READONLY} mt-1 capitalize`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">{t('nurse_walkin.dob')}</label>
                    <input readOnly value={formatDobShort(selectedPatient.date_of_birth) ?? '—'} className={`${READONLY} mt-1`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">{t('nurse_walkin.age')}</label>
                    <input
                      readOnly
                      value={
                        calculateAgeFromDob(selectedPatient.date_of_birth) != null
                          ? String(calculateAgeFromDob(selectedPatient.date_of_birth))
                          : '—'
                      }
                      className={`${READONLY} mt-1`}
                    />
                  </div>
                </div>
              </section>

              <section>
                <h3 className={SECTION}>{t('nurse_walkin.visit_details')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">{t('nurse_walkin.appointment_date')} *</label>
                    <input
                      type="date"
                      required
                      value={appointmentDate}
                      onChange={(e) => setAppointmentDate(e.target.value)}
                      className={`${INPUT} mt-1`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">{t('nurse_walkin.appointment_time')}</label>
                    <input
                      type="time"
                      value={appointmentTime}
                      onChange={(e) => setAppointmentTime(e.target.value)}
                      className={`${INPUT} mt-1`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('nurse_walkin.service')}</label>
                    <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={`${INPUT} mt-1`}>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {serviceTitle(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('nurse_walkin.visit_type')}</label>
                    <select
                      value={onsiteType}
                      onChange={(e) => setOnsiteType(e.target.value as 'onsite' | 'telemedicine')}
                      className={`${INPUT} mt-1`}
                    >
                      <option value="onsite">{t('nurse_walkin.onsite')}</option>
                      <option value="telemedicine">{t('nurse_walkin.telemedicine')}</option>
                    </select>
                  </div>
                </div>
              </section>

              <IntakeFormFields
                value={intakeForm}
                onChange={setIntakeForm}
                fieldPrefix="walkin"
                inputClassName={INPUT}
                sectionClassName={SECTION}
                showOptionalHint
              />

              <section>
                <h3 className={SECTION}>{t('nurse_walkin.pharmacy')}</h3>
                <input
                  value={pharmacyQuery}
                  onChange={(e) => setPharmacyQuery(e.target.value)}
                  placeholder={t('nurse_walkin.pharmacy_search')}
                  className={`${INPUT} mb-2`}
                />
                <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)} className={INPUT}>
                  <option value="">{t('nurse_walkin.pharmacy_none')}</option>
                  {filteredPharmacies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || `#${p.id}`}
                      {p.address ? ` — ${p.address}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowManualPharmacy((v) => !v)}
                  className="mt-2 text-sm text-[#2E6EF3] font-medium hover:underline"
                >
                  + {t('nurse_walkin.pharmacy_manual')}
                </button>
                {showManualPharmacy && (
                  <div className="mt-3 p-3 border border-slate-200 rounded-xl space-y-2">
                    <input value={manualPharmacy.name} onChange={(e) => setManualPharmacy((f) => ({ ...f, name: e.target.value }))} placeholder={t('pharmacies.name_req')} className={INPUT} />
                    <input value={manualPharmacy.address} onChange={(e) => setManualPharmacy((f) => ({ ...f, address: e.target.value }))} placeholder={t('pharmacies.address')} className={INPUT} />
                    <input value={manualPharmacy.phone} onChange={(e) => setManualPharmacy((f) => ({ ...f, phone: phoneDigitsOnly(e.target.value) }))} placeholder={t('pharmacies.phone')} className={INPUT} />
                    <input value={manualPharmacy.email} onChange={(e) => setManualPharmacy((f) => ({ ...f, email: e.target.value }))} placeholder={t('pharmacies.email')} className={INPUT} />
                    <button type="button" onClick={() => void addManualPharmacy()} className="text-sm font-semibold text-[#2E6EF3]">
                      {t('nurse_walkin.pharmacy_add')}
                    </button>
                  </div>
                )}
              </section>

              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                {t('nurse_walkin.no_signature_hint')}
              </p>
            </div>
          )}
        </div>

        {step === 'form' && selectedPatient && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleCreateClick}
              disabled={submitting}
              className="h-10 px-5 rounded-xl bg-[#2E6EF3] text-white text-sm font-semibold hover:bg-[#1f5ad2] disabled:opacity-50"
            >
              {submitting ? t('common.saving') : t('nurse_walkin.create_encounter')}
            </button>
          </div>
        )}

        {showFutureConfirm && selectedPatient && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-900/40 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6">
              <h3 className="text-lg font-bold text-slate-900">{t('nurse_walkin.future_appointment_title')}</h3>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                {t('nurse_walkin.future_appointment_body', {
                  date: formatClinicDateOnly(appointmentDate, language, { weekday: 'long' }),
                  time: formatClinicTimeSlot(appointmentTime) || appointmentTime,
                })}
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFutureConfirm(false)}
                  disabled={submitting}
                  className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void submitWalkIn()}
                  disabled={submitting}
                  className="h-10 px-5 rounded-xl bg-[#2E6EF3] text-white text-sm font-semibold hover:bg-[#1f5ad2] disabled:opacity-50"
                >
                  {submitting ? t('common.saving') : t('nurse_walkin.future_appointment_confirm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
