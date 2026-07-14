'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { DobDateInput } from '@/components/DobDateInput'
import { AddressLookupFields } from '@/components/AddressLookupFields'
import { useT } from '@/lib/i18n'
import { useUserLocations } from '@/lib/hooks/use-user-locations'
import { phoneDigitsOnly } from '@/lib/phone-digits'
import type { PatientDocumentLabel } from '@/lib/validation'

const INPUT =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/35 focus:border-violet-400 transition-shadow'
const SECTION =
  'text-xs font-bold uppercase tracking-wide text-violet-800 mb-3'
const CARD =
  'rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm space-y-3'
const LABEL = 'text-xs font-medium text-slate-600'
const BTN_PRIMARY =
  'px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors shadow-sm shadow-violet-600/20'
const BTN_SECONDARY =
  'px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 disabled:opacity-50 transition-colors'

type Step = 'location' | 'form' | 'documents'

type ServiceRow = { id: number; title_en: string; title_es?: string | null }

type CreatedPatient = {
  id: number
  patient_code: string | null
  first_name: string
  last_name: string
  created_by_source: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onCreated: (result: {
    patientId: number
    encounterId: number | null
    appointmentId: number | null
  }) => void
  defaultLocationId?: number | null
}

const DOCUMENT_UPLOAD_OPTIONS: Array<{ value: PatientDocumentLabel; labelKey: string }> = [
  { value: 'id_document', labelKey: 'patient_register.doc_id' },
  { value: 'previous_medical_records', labelKey: 'patient_register.doc_previous_records' },
  { value: 'lab_result', labelKey: 'patient_register.doc_lab' },
  { value: 'imaging', labelKey: 'patient_register.doc_imaging' },
  { value: 'other', labelKey: 'patient_register.doc_other' },
]

export function NurseRegisterPatientModal({
  isOpen,
  onClose,
  onCreated,
  defaultLocationId,
}: Props) {
  const { t, language } = useT()
  const { locations, locationIds, unrestricted, loading: locationsLoading } = useUserLocations()

  /** Nurses are never unrestricted — only their assigned clinics may appear. */
  const assignedLocations = useMemo(() => {
    if (unrestricted) return []
    if (locationIds.length > 0) {
      const allowed = new Set(locationIds)
      return locations.filter((loc) => allowed.has(loc.id))
    }
    return locations
  }, [locations, locationIds, unrestricted])

  const [step, setStep] = useState<Step>('location')
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [servicesLoading, setServicesLoading] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('')
  const [dob, setDob] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [state, setState] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [locationId, setLocationId] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [textOptIn, setTextOptIn] = useState(false)
  const [checkOptIn, setCheckOptIn] = useState(false)
  const [services, setServices] = useState<ServiceRow[]>([])
  const [serviceId, setServiceId] = useState('')

  const [created, setCreated] = useState<CreatedPatient | null>(null)
  const [createdEncounterId, setCreatedEncounterId] = useState<number | null>(null)
  const [createdAppointmentId, setCreatedAppointmentId] = useState<number | null>(null)

  const [pendingFiles, setPendingFiles] = useState<
    Array<{ file: File; label: PatientDocumentLabel; id: string }>
  >([])
  const [uploadLabel, setUploadLabel] = useState<PatientDocumentLabel>('id_document')

  const notifiedRef = useRef(false)

  const reset = useCallback(() => {
    setStep('location')
    setFirstName('')
    setLastName('')
    setEmail('')
    setPhone('')
    setGender('')
    setDob('')
    setStreetAddress('')
    setState('')
    setZipCode('')
    setLocationId('')
    setLocationQuery('')
    setTextOptIn(false)
    setCheckOptIn(false)
    setServices([])
    setServiceId('')
    setCreated(null)
    setCreatedEncounterId(null)
    setCreatedAppointmentId(null)
    setPendingFiles([])
    setUploadLabel('id_document')
    notifiedRef.current = false
  }, [])

  useEffect(() => {
    if (!isOpen) {
      reset()
      return
    }
    if (defaultLocationId && assignedLocations.some((loc) => loc.id === defaultLocationId)) {
      setLocationId(String(defaultLocationId))
      return
    }
    if (assignedLocations.length === 1) {
      const only = assignedLocations[0]
      if (only) setLocationId(String(only.id))
    }
  }, [isOpen, defaultLocationId, assignedLocations, reset])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setServicesLoading(true)
    fetch('/api/nurse/walk-in', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        const rows = (json.services ?? []) as ServiceRow[]
        setServices(rows)
        if (rows[0]?.id) setServiceId(String(rows[0].id))
      })
      .catch(() => {
        if (!cancelled) toast.error(t('nurse_walkin.options_failed'))
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, t])

  const serviceTitle = (s: ServiceRow) =>
    language === 'es' && s.title_es ? s.title_es : s.title_en

  const selectedLocation = useMemo(
    () => assignedLocations.find((loc) => String(loc.id) === locationId) ?? null,
    [assignedLocations, locationId]
  )

  const filteredLocations = useMemo(() => {
    const q = locationQuery.trim().toLowerCase()
    if (!q) return assignedLocations
    return assignedLocations.filter((loc) => {
      const haystack = [loc.title, loc.location_code, loc.address]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [assignedLocations, locationQuery])

  const locationReady =
    Boolean(locationId) && assignedLocations.some((loc) => String(loc.id) === locationId)

  const canSubmit = useMemo(() => {
    const emailTrimmed = email.trim()
    const emailOk = !emailTrimmed || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)
    return Boolean(
      firstName.trim() &&
        lastName.trim() &&
        locationReady &&
        serviceId &&
        emailOk &&
        !submitting &&
        !servicesLoading
    )
  }, [firstName, lastName, locationReady, serviceId, email, submitting, servicesLoading])

  const emailError = useMemo(() => {
    const emailTrimmed = email.trim()
    if (!emailTrimmed) return null
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) return null
    return t('auth.invalid_email')
  }, [email, t])

  const continueFromLocation = () => {
    if (!locationReady) return
    setStep('form')
  }

  const notifyCreated = (patient: CreatedPatient, encounterId: number | null, appointmentId: number | null) => {
    if (notifiedRef.current) return
    notifiedRef.current = true
    onCreated({
      patientId: patient.id,
      encounterId,
      appointmentId,
    })
  }

  const handleClose = () => {
    if (submitting || uploading) return
    if (created) {
      notifyCreated(created, createdEncounterId, createdAppointmentId)
    }
    onClose()
  }

  const submitRegistration = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/nurse/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          gender: gender || null,
          date_of_birth: dob || null,
          street_address: streetAddress.trim() || null,
          state: state.trim() || null,
          zip_code: zipCode.trim() || null,
          location_id: Number(locationId),
          is_text_opt_in: textOptIn,
          is_check_opt_in: checkOptIn,
          service_id: Number(serviceId),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || t('patient_register.create_failed'))
      }

      const patient = json.patient as CreatedPatient
      setCreated(patient)
      setCreatedEncounterId(typeof json.encounter_id === 'number' ? json.encounter_id : null)
      setCreatedAppointmentId(typeof json.appointment_id === 'number' ? json.appointment_id : null)
      toast.success(t('patient_register.create_success'))
      setStep('documents')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('patient_register.create_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const addPendingFile = (fileList: FileList | null) => {
    if (!fileList?.length) return
    const next = Array.from(fileList).map((file) => ({
      file,
      label: uploadLabel,
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
    }))
    setPendingFiles((prev) => [...prev, ...next])
  }

  const uploadDocuments = async () => {
    if (!created || pendingFiles.length === 0) {
      handleClose()
      return
    }
    setUploading(true)
    try {
      for (const item of pendingFiles) {
        const formData = new FormData()
        formData.append('file', item.file)
        formData.append('document_label', item.label)
        formData.append('document_name', item.file.name)
        const res = await fetch(`/api/patients/${created.id}/documents`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json.error || t('patient_register.upload_failed'))
        }
      }
      toast.success(t('patient_register.upload_success'))
      notifyCreated(created, createdEncounterId, createdAppointmentId)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('patient_register.upload_failed'))
    } finally {
      setUploading(false)
    }
  }

  const stepIndex = step === 'location' ? 0 : step === 'form' ? 1 : 2
  const stepLabels = [
    t('patient_register.location'),
    t('patient_register.patient_details'),
    t('patient_register.documents'),
  ]

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-2xl bg-[#fafafe] shadow-2xl shadow-violet-900/10 flex flex-col border border-violet-100">
        <div className="px-5 py-4 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50/40 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-slate-900">{t('patient_register.title')}</h2>
              <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-100/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
                {t('patient_source.direct')}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{t('patient_register.subtitle')}</p>
            <div className="mt-3 flex items-center gap-1.5">
              {stepLabels.map((label, i) => (
                <div key={label} className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                      i < stepIndex
                        ? 'bg-violet-600 text-white'
                        : i === stepIndex
                          ? 'bg-violet-600 text-white ring-4 ring-violet-200'
                          : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`hidden sm:inline text-[11px] font-medium truncate max-w-[7rem] ${
                      i === stepIndex ? 'text-violet-800' : 'text-slate-400'
                    }`}
                  >
                    {label}
                  </span>
                  {i < stepLabels.length - 1 ? (
                    <span className="hidden sm:block w-6 h-px bg-slate-200 mx-0.5" aria-hidden />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting || uploading}
            className="shrink-0 rounded-xl px-2.5 py-1.5 text-slate-500 hover:bg-white/80 hover:text-slate-800 text-sm font-medium"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {step === 'location' ? (
            <section className="space-y-4">
              <div className={CARD}>
                <h3 className={SECTION}>{t('patient_register.location')}</h3>
                <p className="text-sm text-slate-500 -mt-1">
                  {t('patient_register.location_first_hint')}
                </p>

              {locationsLoading ? (
                <div className="py-16 flex justify-center"><LoadingSpinner size="sm" /></div>
              ) : assignedLocations.length === 0 ? (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  {t('patient_register.no_assigned_locations')}
                </p>
              ) : (
                <div className="space-y-3">
                  {assignedLocations.length > 5 ? (
                    <input
                      type="search"
                      value={locationQuery}
                      onChange={(e) => setLocationQuery(e.target.value)}
                      placeholder={t('patient_register.location_search_ph')}
                      className={INPUT}
                      autoFocus
                    />
                  ) : null}

                  <div
                    role="listbox"
                    aria-label={t('patient_register.location')}
                    className="border border-violet-100 rounded-2xl max-h-[min(28rem,55vh)] overflow-y-auto bg-white"
                  >
                    {filteredLocations.length === 0 ? (
                      <p className="px-4 py-8 text-sm text-slate-500 text-center">
                        {t('common.no_results')}
                      </p>
                    ) : (
                      filteredLocations.map((loc, index) => {
                        const selected = locationId === String(loc.id)
                        const isFirst = index === 0
                        const isLast = index === filteredLocations.length - 1
                        return (
                          <button
                            key={loc.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => setLocationId(String(loc.id))}
                            onDoubleClick={() => {
                              setLocationId(String(loc.id))
                              setStep('form')
                            }}
                            className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors border-b border-slate-100 last:border-b-0 ${
                              isFirst ? 'rounded-t-2xl' : ''
                            } ${isLast ? 'rounded-b-2xl' : ''} ${
                              selected
                                ? 'bg-violet-50 border-l-4 border-l-violet-600 pl-3'
                                : 'hover:bg-violet-50/40 bg-white border-l-4 border-l-transparent'
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                selected
                                  ? 'border-violet-600 bg-violet-600'
                                  : 'border-slate-300 bg-white'
                              }`}
                              aria-hidden
                            >
                              {selected ? (
                                <span className="h-2 w-2 rounded-full bg-white" />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-slate-900">
                                {loc.title}
                              </span>
                              {(loc.location_code || loc.address) && (
                                <span className="mt-0.5 block text-xs text-slate-500 truncate">
                                  {[loc.location_code, loc.address].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </span>
                            {selected ? (
                              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                                {t('patient_register.selected')}
                              </span>
                            ) : null}
                          </button>
                        )
                      })
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400">
                    {t('patient_register.location_count', { count: assignedLocations.length })}
                  </p>
                </div>
              )}
              </div>
            </section>
          ) : step === 'form' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                      {t('patient_register.location')}
                    </p>
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {selectedLocation?.title ?? t('common.na')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('location')}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                >
                  {t('patient_register.change_location')}
                </button>
              </div>

              <section className={CARD}>
                <h3 className={SECTION}>{t('patient_register.treatment_type')}</h3>
                <p className="text-xs text-slate-500 -mt-1">{t('patient_register.treatment_type_required')}</p>
                <div>
                  <label className={LABEL}>{t('patient_register.treatment_type')}</label>
                  <select
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                    disabled={servicesLoading || services.length === 0}
                    className={`${INPUT} mt-1.5`}
                    required
                  >
                    {services.length === 0 ? (
                      <option value="">{t('patient_register.treatment_type_ph')}</option>
                    ) : null}
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {serviceTitle(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-500 pt-2 leading-relaxed">{t('patient_register.visit_opens_hint')}</p>
              </section>

              <section className={CARD}>
                <h3 className={SECTION}>{t('patient_register.patient_details')}</h3>
                <p className="text-xs text-slate-500 -mt-1">{t('patient_register.patient_details_hint')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className={LABEL}>{t('nurse_walkin.first_name')} *</label>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className={`${INPUT} mt-1.5`}
                      placeholder={t('patient_register.first_name_ph')}
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>{t('nurse_walkin.last_name')} *</label>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className={`${INPUT} mt-1.5`}
                      placeholder={t('patient_register.last_name_ph')}
                      autoComplete="family-name"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>{t('common.dob')}</label>
                    <div className="mt-1.5">
                      <DobDateInput value={dob} onChange={(v) => setDob(v ?? '')} className={INPUT} />
                    </div>
                  </div>
                  <div>
                    <label className={LABEL}>{t('common.gender')}</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as typeof gender)}
                      className={`${INPUT} mt-1.5`}
                    >
                      <option value="">{t('patient_register.select_option')}</option>
                      <option value="male">{t('common.male')}</option>
                      <option value="female">{t('common.female')}</option>
                      <option value="other">{t('common.others')}</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className={CARD}>
                <h3 className={SECTION}>{t('patient_register.contact_info')}</h3>
                <p className="text-xs text-slate-500 -mt-1">{t('patient_register.contact_info_hint')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className={LABEL}>{t('common.phone')}</label>
                    <div className="mt-1.5 flex rounded-xl border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-violet-500/35 focus-within:border-violet-400 transition-shadow overflow-hidden">
                      <span className="inline-flex items-center px-3.5 text-sm font-semibold text-slate-600 bg-slate-50 border-r border-slate-200 select-none">
                        +1
                      </span>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(phoneDigitsOnly(e.target.value).slice(0, 10))}
                        className="w-full border-0 bg-transparent px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                        placeholder={t('patient_register.phone_ph')}
                        inputMode="numeric"
                        autoComplete="tel-national"
                        aria-label={t('common.phone')}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={LABEL}>{t('common.email')}</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`${INPUT} mt-1.5 ${
                        emailError
                          ? 'border-red-300 focus:border-red-400 focus:ring-red-500/25'
                          : ''
                      }`}
                      placeholder={t('patient_register.email_ph')}
                      autoComplete="email"
                      aria-invalid={emailError ? true : undefined}
                    />
                    {emailError ? (
                      <p className="mt-1.5 text-xs text-red-600">{emailError}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-2">
                    <AddressLookupFields
                      streetAddress={streetAddress}
                      state={state}
                      zipCode={zipCode}
                      onStreetAddressChange={setStreetAddress}
                      onStateChange={setState}
                      onZipCodeChange={setZipCode}
                      streetLabel={t('common.address')}
                      stateLabel={t('encounter_modal.patient_state')}
                      zipLabel={t('encounter_modal.patient_zip')}
                      streetPlaceholder={t('encounter_modal.patient_street_placeholder')}
                      inputClassName={INPUT}
                    />
                  </div>
                  <label className="flex items-center gap-2.5 text-sm text-slate-700 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 cursor-pointer hover:border-violet-200">
                    <input
                      type="checkbox"
                      checked={textOptIn}
                      onChange={(e) => setTextOptIn(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    {t('patient_register.text_opt_in')}
                  </label>
                  <label className="flex items-center gap-2.5 text-sm text-slate-700 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 cursor-pointer hover:border-violet-200">
                    <input
                      type="checkbox"
                      checked={checkOptIn}
                      onChange={(e) => setCheckOptIn(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    {t('patient_register.check_opt_in')}
                  </label>
                </div>
              </section>
            </>
          ) : (
            <section className={CARD}>
              <h3 className={SECTION}>{t('patient_register.documents')}</h3>
              <p className="text-xs text-slate-500 -mt-1">
                {t('patient_register.documents_hint', {
                  name: created ? `${created.first_name} ${created.last_name}` : '',
                })}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className={LABEL}>{t('patient_file.document_label')}</label>
                  <select
                    value={uploadLabel}
                    onChange={(e) => setUploadLabel(e.target.value as PatientDocumentLabel)}
                    className={`${INPUT} mt-1.5`}
                  >
                    {DOCUMENT_UPLOAD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>{t('patient_register.choose_files')}</label>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,image/png,image/jpeg"
                    className={`${INPUT} mt-1.5`}
                    onChange={(e) => {
                      addPendingFile(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>
              {pendingFiles.length === 0 ? (
                <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
                  {t('patient_register.no_docs_yet')}
                </p>
              ) : (
                <ul className="space-y-2">
                  {pendingFiles.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2.5 text-sm"
                    >
                      <span className="truncate text-slate-800">
                        {item.file.name}
                        <span className="text-slate-400 ml-2">
                          ({t(DOCUMENT_UPLOAD_OPTIONS.find((o) => o.value === item.label)?.labelKey || 'patient_register.doc_other')})
                        </span>
                      </span>
                      <button
                        type="button"
                        className="text-xs font-medium text-red-600 hover:underline shrink-0"
                        onClick={() => setPendingFiles((prev) => prev.filter((p) => p.id !== item.id))}
                      >
                        {t('common.remove')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="px-5 py-4 border-t border-violet-100 bg-white/90 flex flex-wrap items-center justify-end gap-2">
          {step === 'location' ? (
            <>
              <button type="button" onClick={handleClose} className={BTN_SECONDARY}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={!locationReady || locationsLoading}
                onClick={continueFromLocation}
                className={BTN_PRIMARY}
              >
                {t('common.next')}
              </button>
            </>
          ) : step === 'form' ? (
            <>
              <button
                type="button"
                onClick={() => setStep('location')}
                disabled={submitting}
                className={BTN_SECONDARY}
              >
                {t('common.back')}
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void submitRegistration()}
                className={BTN_PRIMARY}
              >
                {submitting ? <LoadingSpinner size="xs" compact /> : null}
                {submitting ? t('patient_register.creating') : t('patient_register.create')}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={uploading} onClick={handleClose} className={BTN_SECONDARY}>
                {t('patient_register.skip_docs')}
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => void uploadDocuments()}
                className={BTN_PRIMARY}
              >
                {uploading ? <LoadingSpinner size="xs" compact /> : null}
                {uploading
                  ? t('patient_register.uploading')
                  : pendingFiles.length
                    ? t('patient_register.upload_finish')
                    : t('patient_register.finish')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
