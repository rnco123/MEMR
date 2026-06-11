'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { SearchByDobDropdowns } from '@/components/SearchByDobDropdowns'
import { useT } from '@/lib/i18n'
import { calculateAgeFromDob } from '@/lib/nurse/walk-in-intake'
import { parseSearchDateToIso } from '@/lib/nurse/patient-search-query'
import { phoneDigitsOnly } from '@/lib/phone-digits'
import { normalizePharmacyRow, type PharmacyRecord } from '@/lib/pharmacies/normalize'

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
}

type ServiceRow = { id: number; title_en: string; title_es?: string | null }

type Step = 'search' | 'select' | 'form'

const RELIEVING_OPTIONS = [
  'Rest',
  'Ice',
  'Heat',
  'Elevation',
  'Medication',
  'Stretching',
  'Massage',
  'Support or compression',
  'Time',
  'Other',
] as const

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]'
const READONLY = `${INPUT} bg-slate-50 text-slate-600 cursor-not-allowed`
const SECTION = 'text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3'

function formatDobDisplay(dob: string | null | undefined): string {
  if (!dob) return '—'
  const d = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dob
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10)
}

function getCurrentTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onCreated: (result: { appointmentId: number; encounterId: number; patientId: number }) => void
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

  const [chiefComplaint, setChiefComplaint] = useState('')
  const [onset, setOnset] = useState('')
  const [symptomLocation, setSymptomLocation] = useState('')
  const [severity, setSeverity] = useState('')
  const [symptomDetails, setSymptomDetails] = useState('')
  const [relievingFactors, setRelievingFactors] = useState<string[]>([])
  const [currentMedications, setCurrentMedications] = useState('')
  const [medicalConditions, setMedicalConditions] = useState('')
  const [surgeries, setSurgeries] = useState<'yes' | 'no' | ''>('')
  const [allergies, setAllergies] = useState<'yes' | 'no' | ''>('')
  const [fhHypertension, setFhHypertension] = useState(false)
  const [fhDiabetes, setFhDiabetes] = useState(false)
  const [fhCancer, setFhCancer] = useState(false)
  const [fhHeart, setFhHeart] = useState(false)
  const [occupation, setOccupation] = useState('')
  const [tobaccoUse, setTobaccoUse] = useState(false)
  const [alcoholUse, setAlcoholUse] = useState(false)
  const [drugUse, setDrugUse] = useState(false)

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
    setChiefComplaint('')
    setOnset('')
    setSymptomLocation('')
    setSeverity('')
    setSymptomDetails('')
    setRelievingFactors([])
    setCurrentMedications('')
    setMedicalConditions('')
    setSurgeries('')
    setAllergies('')
    setFhHypertension(false)
    setFhDiabetes(false)
    setFhCancer(false)
    setFhHeart(false)
    setOccupation('')
    setTobaccoUse(false)
    setAlcoholUse(false)
    setDrugUse(false)
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

  const runSearch = async () => {
    const trimmedSearch = searchQuery.trim()
    const parsedDob = parseSearchDateToIso(trimmedSearch)
    if (!trimmedSearch && !dobYear && !parsedDob) {
      toast.error(t('nurse_walkin.search_required'))
      return
    }
    setSearching(true)
    try {
      const params = new URLSearchParams()
      if (trimmedSearch) params.set('search', trimmedSearch)
      if (dobYear) params.set('dob_year', dobYear)
      if (dobMonth) params.set('dob_month', dobMonth)
      if (dobDay) params.set('dob_day', dobDay)
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
        toast.message(t('nurse_walkin.no_patients'))
        setStep('search')
      } else if (patients.length === 1) {
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
  }

  const selectPatient = (p: PatientRow) => {
    setSelectedPatient(p)
    setStep('form')
  }

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

  const toggleRelieving = (value: string) => {
    setRelievingFactors((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

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
    setSubmitting(true)
    try {
      const intake: Record<string, unknown> = {}
      if (chiefComplaint.trim()) intake.chief_complaint = chiefComplaint.trim()
      if (onset) intake.onset = onset
      if (symptomLocation.trim()) intake.location = symptomLocation.trim()
      if (severity) intake.severity = Number(severity)
      if (symptomDetails.trim()) intake.symptoms_description = symptomDetails.trim()
      if (relievingFactors.length) intake.relieving_factors = relievingFactors
      if (currentMedications.trim()) intake.current_medications = currentMedications.trim()
      if (medicalConditions.trim()) intake.medical_conditions = medicalConditions.trim()
      if (surgeries) intake.surgeries = surgeries
      if (allergies) intake.allergies = allergies
      if (fhHypertension) intake.fh_hypertension = true
      if (fhDiabetes) intake.fh_diabetes = true
      if (fhCancer) intake.fh_cancer = true
      if (fhHeart) intake.fh_heart_disease = true
      if (tobaccoUse) intake.tobacco_use = true
      if (alcoholUse) intake.alcohol_use = true
      if (drugUse) intake.drug_use = true

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
          intake: Object.keys(intake).length > 0 ? intake : undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || json.message || 'Failed')
      toast.success(t('nurse_walkin.created'))
      onCreated({
        appointmentId: json.data.appointment_id,
        encounterId: json.data.encounter_id,
        patientId: json.data.patient_id,
      })
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('nurse_walkin.create_failed'))
    } finally {
      setSubmitting(false)
    }
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
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-x-hidden"
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
              <button
                type="button"
                onClick={() => void runSearch()}
                disabled={searching}
                className="h-10 px-5 rounded-xl bg-[#2E6EF3] text-white text-sm font-semibold hover:bg-[#1f5ad2] disabled:opacity-50"
              >
                {searching ? t('common.loading') : t('nurse_walkin.search_btn')}
              </button>

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
                      <p className="font-semibold text-slate-900">
                        {p.first_name} {p.last_name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatDobDisplay(p.date_of_birth)}
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
                    <input readOnly value={formatDobDisplay(selectedPatient.date_of_birth)} className={`${READONLY} mt-1`} />
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

              <section>
                <h3 className={SECTION}>{t('nurse_walkin.medical_info')}</h3>
                <p className="text-xs text-slate-500 mb-3">{t('nurse_walkin.optional_hint')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-600">{t('nurse_walkin.reason')}</label>
                    <input value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} className={`${INPUT} mt-1`} placeholder={t('nurse_walkin.reason_ph')} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('nurse_walkin.feeling_since')}</label>
                    <input type="date" value={onset} onChange={(e) => setOnset(e.target.value)} className={`${INPUT} mt-1`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('nurse_walkin.symptom_location')}</label>
                    <input value={symptomLocation} onChange={(e) => setSymptomLocation(e.target.value)} className={`${INPUT} mt-1`} placeholder={t('nurse_walkin.symptom_location_ph')} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('nurse_walkin.severity')}</label>
                    <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={`${INPUT} mt-1`}>
                      <option value="">{t('nurse_walkin.select')}</option>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-600">{t('nurse_walkin.symptom_details')}</label>
                    <input value={symptomDetails} onChange={(e) => setSymptomDetails(e.target.value)} className={`${INPUT} mt-1`} placeholder={t('nurse_walkin.symptom_details_ph')} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-600 block mb-2">{t('nurse_walkin.relieving')}</label>
                    <div className="flex flex-wrap gap-2">
                      {RELIEVING_OPTIONS.map((opt) => (
                        <label key={opt} className="inline-flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={relievingFactors.includes(opt)}
                            onChange={() => toggleRelieving(opt)}
                            className="rounded border-slate-300"
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('nurse_walkin.medications')}</label>
                    <input value={currentMedications} onChange={(e) => setCurrentMedications(e.target.value)} className={`${INPUT} mt-1`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('nurse_walkin.conditions')}</label>
                    <input value={medicalConditions} onChange={(e) => setMedicalConditions(e.target.value)} className={`${INPUT} mt-1`} />
                  </div>
                </div>
              </section>

              <section>
                <h3 className={SECTION}>{t('nurse_walkin.medical_history')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-slate-600">{t('nurse_walkin.surgeries')}</span>
                    <div className="flex gap-4 mt-2">
                      {(['yes', 'no'] as const).map((v) => (
                        <label key={v} className="inline-flex items-center gap-1.5 text-sm">
                          <input type="radio" name="surgeries" checked={surgeries === v} onChange={() => setSurgeries(v)} />
                          {v === 'yes' ? t('common.yes') : t('common.no')}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-600">{t('nurse_walkin.allergies')}</span>
                    <div className="flex gap-4 mt-2">
                      {(['yes', 'no'] as const).map((v) => (
                        <label key={v} className="inline-flex items-center gap-1.5 text-sm">
                          <input type="radio" name="allergies" checked={allergies === v} onChange={() => setAllergies(v)} />
                          {v === 'yes' ? t('common.yes') : t('common.no')}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-xs text-slate-600 block mb-2">{t('nurse_walkin.family_history')}</span>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { key: 'fhHypertension', label: t('nurse_walkin.fh_hypertension'), checked: fhHypertension, set: setFhHypertension },
                        { key: 'fhDiabetes', label: t('nurse_walkin.fh_diabetes'), checked: fhDiabetes, set: setFhDiabetes },
                        { key: 'fhCancer', label: t('nurse_walkin.fh_cancer'), checked: fhCancer, set: setFhCancer },
                        { key: 'fhHeart', label: t('nurse_walkin.fh_heart'), checked: fhHeart, set: setFhHeart },
                      ].map(({ key, label, checked, set }) => (
                        <label key={key} className="inline-flex items-center gap-1.5 text-sm">
                          <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className={SECTION}>{t('nurse_walkin.social_history')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-600">{t('nurse_walkin.occupation')}</label>
                    <input value={occupation} onChange={(e) => setOccupation(e.target.value)} className={`${INPUT} mt-1`} placeholder={t('nurse_walkin.occupation_ph')} />
                  </div>
                  <div>
                    <span className="text-xs text-slate-600 block mb-2">{t('nurse_walkin.lifestyle')}</span>
                    <div className="flex flex-wrap gap-3">
                      <label className="inline-flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={tobaccoUse} onChange={(e) => setTobaccoUse(e.target.checked)} />
                        {t('nurse_walkin.tobacco')}
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={alcoholUse} onChange={(e) => setAlcoholUse(e.target.checked)} />
                        {t('nurse_walkin.alcohol')}
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={drugUse} onChange={(e) => setDrugUse(e.target.checked)} />
                        {t('nurse_walkin.drug')}
                      </label>
                    </div>
                  </div>
                </div>
              </section>

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
              onClick={() => void submitWalkIn()}
              disabled={submitting}
              className="h-10 px-5 rounded-xl bg-[#2E6EF3] text-white text-sm font-semibold hover:bg-[#1f5ad2] disabled:opacity-50"
            >
              {submitting ? t('common.saving') : t('nurse_walkin.create_encounter')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
