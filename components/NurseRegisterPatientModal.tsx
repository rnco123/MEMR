'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { DobDateInput } from '@/components/DobDateInput'
import { AddressLookupFields } from '@/components/AddressLookupFields'
import { IntakeFormFields } from '@/components/IntakeFormFields'
import { useT } from '@/lib/i18n'
import { useUserLocations } from '@/lib/hooks/use-user-locations'
import { emptyIntakeFormInput } from '@/lib/intake/intake-form-mappers'
import { phoneDigitsOnly } from '@/lib/phone-digits'
import type { NurseWalkInIntakeInput } from '@/lib/validation'
import type { PatientDocumentLabel } from '@/lib/validation'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]'
const SECTION = 'text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3'

type Step = 'form' | 'documents'

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
  const { t } = useT()
  const { locations, loading: locationsLoading } = useUserLocations()

  const [step, setStep] = useState<Step>('form')
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)

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
  const [textOptIn, setTextOptIn] = useState(false)
  const [checkOptIn, setCheckOptIn] = useState(false)

  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [emergencyRelationship, setEmergencyRelationship] = useState('')

  const [intakeForm, setIntakeForm] = useState<NurseWalkInIntakeInput>(emptyIntakeFormInput())
  const [startEncounter, setStartEncounter] = useState(false)

  const [created, setCreated] = useState<CreatedPatient | null>(null)
  const [createdEncounterId, setCreatedEncounterId] = useState<number | null>(null)
  const [createdAppointmentId, setCreatedAppointmentId] = useState<number | null>(null)

  const [pendingFiles, setPendingFiles] = useState<
    Array<{ file: File; label: PatientDocumentLabel; id: string }>
  >([])
  const [uploadLabel, setUploadLabel] = useState<PatientDocumentLabel>('id_document')

  const notifiedRef = useRef(false)

  const reset = useCallback(() => {
    setStep('form')
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
    setTextOptIn(false)
    setCheckOptIn(false)
    setEmergencyName('')
    setEmergencyPhone('')
    setEmergencyRelationship('')
    setIntakeForm(emptyIntakeFormInput())
    setStartEncounter(false)
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
    if (defaultLocationId) {
      setLocationId(String(defaultLocationId))
    } else if (locations.length === 1) {
      const only = locations[0]
      if (only) setLocationId(String(only.id))
    }
  }, [isOpen, defaultLocationId, locations, reset])

  const canSubmit = useMemo(() => {
    return Boolean(firstName.trim() && lastName.trim() && locationId && !submitting)
  }, [firstName, lastName, locationId, submitting])

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
          emergency_contact_name: emergencyName.trim() || null,
          emergency_contact_phone: emergencyPhone.trim() || null,
          emergency_contact_relationship: emergencyRelationship.trim() || null,
          intake: intakeForm,
          start_encounter: startEncounter,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || t('patient_register.create_failed'))
      }

      const patient = json.patient as CreatedPatient
      setCreated(patient)
      setCreatedEncounterId(json.encounter_id ?? null)
      setCreatedAppointmentId(json.appointment_id ?? null)
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t('patient_register.title')}</h2>
            <p className="text-xs text-slate-500 mt-1">{t('patient_register.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting || uploading}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 text-sm"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {step === 'form' ? (
            <>
              <section>
                <h3 className={SECTION}>{t('patient_register.patient_details')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-600">{t('nurse_walkin.first_name')} *</label>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={`${INPUT} mt-1`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('nurse_walkin.last_name')} *</label>
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={`${INPUT} mt-1`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('common.dob')}</label>
                    <div className="mt-1">
                      <DobDateInput value={dob} onChange={(v) => setDob(v ?? '')} className={INPUT} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('common.gender')}</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as typeof gender)}
                      className={`${INPUT} mt-1`}
                    >
                      <option value="">{t('patient_register.select_option')}</option>
                      <option value="male">{t('common.male')}</option>
                      <option value="female">{t('common.female')}</option>
                      <option value="other">{t('common.others')}</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-600">{t('patient_register.location')} *</label>
                    <select
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value)}
                      disabled={locationsLoading}
                      className={`${INPUT} mt-1`}
                    >
                      <option value="">{t('patient_register.select_option')}</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section>
                <h3 className={SECTION}>{t('patient_register.contact_info')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-600">{t('common.phone')}</label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(phoneDigitsOnly(e.target.value).slice(0, 15))}
                      className={`${INPUT} mt-1`}
                      placeholder="5551234567"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('common.email')}</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`${INPUT} mt-1`}
                    />
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
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={textOptIn} onChange={(e) => setTextOptIn(e.target.checked)} />
                    {t('patient_register.text_opt_in')}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={checkOptIn} onChange={(e) => setCheckOptIn(e.target.checked)} />
                    {t('patient_register.check_opt_in')}
                  </label>
                </div>
              </section>

              <section>
                <h3 className={SECTION}>{t('patient_register.emergency_contact')}</h3>
                <p className="text-xs text-slate-500 mb-3">{t('patient_register.emergency_optional')}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-600">{t('common.name')}</label>
                    <input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} className={`${INPUT} mt-1`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('common.phone')}</label>
                    <input
                      value={emergencyPhone}
                      onChange={(e) => setEmergencyPhone(phoneDigitsOnly(e.target.value).slice(0, 15))}
                      className={`${INPUT} mt-1`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">{t('patient_register.relationship')}</label>
                    <input
                      value={emergencyRelationship}
                      onChange={(e) => setEmergencyRelationship(e.target.value)}
                      className={`${INPUT} mt-1`}
                      placeholder={t('patient_register.relationship_ph')}
                    />
                  </div>
                </div>
              </section>

              <section>
                <h3 className={SECTION}>{t('patient_register.intake_history')}</h3>
                <p className="text-xs text-slate-500 mb-3">{t('patient_register.intake_hint')}</p>
                <IntakeFormFields
                  value={intakeForm}
                  onChange={setIntakeForm}
                  fieldPrefix="register-intake"
                  inputClassName={INPUT}
                  sectionClassName={SECTION}
                  showOptionalHint
                />
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-start gap-3 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={startEncounter}
                    onChange={(e) => setStartEncounter(e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold block">{t('patient_register.start_encounter')}</span>
                    <span className="text-xs text-slate-500">{t('patient_register.start_encounter_hint')}</span>
                  </span>
                </label>
              </section>
            </>
          ) : (
            <section>
              <h3 className={SECTION}>{t('patient_register.documents')}</h3>
              <p className="text-xs text-slate-500 mb-3">
                {t('patient_register.documents_hint', {
                  name: created ? `${created.first_name} ${created.last_name}` : '',
                })}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-slate-600">{t('patient_file.document_label')}</label>
                  <select
                    value={uploadLabel}
                    onChange={(e) => setUploadLabel(e.target.value as PatientDocumentLabel)}
                    className={`${INPUT} mt-1`}
                  >
                    {DOCUMENT_UPLOAD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-600">{t('patient_register.choose_files')}</label>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,image/png,image/jpeg"
                    className={`${INPUT} mt-1`}
                    onChange={(e) => {
                      addPendingFile(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>
              {pendingFiles.length === 0 ? (
                <p className="text-sm text-slate-500">{t('patient_register.no_docs_yet')}</p>
              ) : (
                <ul className="space-y-2">
                  {pendingFiles.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span className="truncate text-slate-800">
                        {item.file.name}
                        <span className="text-slate-400 ml-2">
                          ({t(DOCUMENT_UPLOAD_OPTIONS.find((o) => o.value === item.label)?.labelKey || 'patient_register.doc_other')})
                        </span>
                      </span>
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
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

        <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
          {step === 'form' ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void submitRegistration()}
                className="px-4 py-2 rounded-xl bg-[#2E6EF3] text-white text-sm font-semibold hover:bg-[#256ae8] disabled:opacity-50 inline-flex items-center gap-2"
              >
                {submitting ? <LoadingSpinner size="xs" compact /> : null}
                {submitting ? t('patient_register.creating') : t('patient_register.create')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={uploading}
                onClick={handleClose}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
              >
                {t('patient_register.skip_docs')}
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => void uploadDocuments()}
                className="px-4 py-2 rounded-xl bg-[#2E6EF3] text-white text-sm font-semibold hover:bg-[#256ae8] disabled:opacity-50 inline-flex items-center gap-2"
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
