'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useT } from '@/lib/i18n'
import { isImmigrationEncounterForI693 } from '@/lib/i693/immigration-eligibility'
import { buildI693Href, getI693BasePath } from '@/lib/i693/paths'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner } from './LoadingSpinner'
import { getStatusInfo, type EncounterStatus } from '@/lib/encounter-status'
import { EncounterRoomingPanel } from './EncounterRoomingPanel'
import { EncounterPrescriptionsPanel } from './EncounterPrescriptionsPanel'
import {
  mergePharmacyIntoList,
  normalizePharmacyRow,
  type PharmacyRecord,
} from '@/lib/pharmacies/normalize'
import { EncounterConsentFormsTab } from './EncounterConsentFormsTab'
import { EncounterSoapPanel } from './EncounterSoapPanel'
import { EncounterPatientInfoPanel } from './EncounterPatientInfoPanel'
import { canEditEncounterSoap, canEditSoapByRole } from '@/lib/soap/encounter-doctor-soap'
import { canDoctorCompleteEncounter } from '@/lib/encounter/complete-encounter'
import { formatClinicDateTimeForLanguage, formatClinicTimeSlot } from '@/lib/datetime/clinic-timezone'

function patientAgeFromDob(dob: string | null): number | null {
  if (!dob) return null
  const birthDate = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

/** Intake severity (1–10) → Low / Medium / High */
function severityBandFromIntake(severity: number | null | undefined): 'low' | 'medium' | 'high' | null {
  if (severity == null || Number.isNaN(Number(severity))) return null
  const n = Math.round(Number(severity))
  if (n < 1 || n > 10) return null
  if (n <= 3) return 'low'
  if (n <= 7) return 'medium'
  return 'high'
}

interface Patient {
  id: number
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  gender: string | null
  date_of_birth: string | null
  zip_code: string | null
  state: string | null
  street_address: string | null
  patient_code: string | null
}

interface IntakeForm {
  id: number
  appointment_id: number
  chief_complaint: string | null
  location: string | null
  severity: number | null
  symptoms_description: string | null
  medical_conditions: any
  surgeries: any
  allergies: any
  current_medications: any
  fh_diabetes: boolean | null
  fh_hypertension: boolean | null
  fh_cancer: boolean | null
  fh_heart_disease: boolean | null
  tobacco_use: boolean | null
  alcohol_use: boolean | null
  drug_use: boolean | null
  onset: string | null
  relieving_factors: any
  cancer_type: string | null
  number_of_pregnancies: number | null
  birth_control: string | null
  last_pap_smear_status: string | null
  last_pap_smear_month_year: string | null
  mammography_status: string | null
  mammography_month_year: string | null
  last_prostate_exam_status: string | null
  last_prostate_exam_month_year: string | null
  occupation: number | null
}

interface Vitals {
  id: number
  encounter_id: number
  bp_systolic: number | null
  bp_diastolic: number | null
  heart_rate: number | null
  respiratory_rate: number | null
  temperature: number | null
  temperature_unit: string | null
  spo2: number | null
  weight: number | null
  weight_unit: string | null
  height: number | null
  height_unit: string | null
  bmi: number | null
  notes: string | null
  created_at: string
}

interface SOAPNotes {
  id: number
  encounter_id: number | null
  subjective_text: string | null
  objective_text: string | null
  assessment_text: string | null
  plan_text: string | null
  created_at: string
  updated_at: string
}

interface Encounter {
  id: number
  appointment_id: number
  patient_id: number
  intake_id: number | null
  pharmacy_id: number | null
  doctor_id?: number | null
  status: string
  encounter_code: string | null
  created_at: string
  identity_verified_at?: string | null
  prescribing_location_ack_at?: string | null
  ma_supervision_ack_at?: string | null
  ready_for_doctor_at?: string | null
  ma_exam_findings?: string | null
  consent_ack?: Record<string, string> | null
  program_type?: string | null
  risk_level?: string | null
  risk_rationale?: string | null
  risk_factors?: string[] | null
  risk_assessed_at?: string | null
  mcm_encounter_id?: number | null
  mcm_sync_status?: 'not_copied' | 'copy_in_progress' | 'copied' | 'copy_failed' | string | null
  mcm_sync_last_attempt_at?: string | null
  mcm_synced_at?: string | null
  mcm_sync_error?: string | null
}

interface Appointment {
  id: number
  appointment_date: string | null
  appointment_time: string | null
  onsite_type: string
  services?: { title_en?: string | null; title_es?: string | null } | null
}

interface Pharmacy {
  id: number
  name?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

interface EncounterDetailModalProps {
  encounterId: number
  appointmentId: number
  patientId: number
  isOpen: boolean
  onClose: () => void
  onJoinTelemedicine?: () => void
  /** Show Join Telemedicine button only when vitals_assessed or later (doctor + nurse can join) */
  canJoinTelemedicine?: boolean
  /** Called after the doctor completes the encounter so the parent can refresh flowboard data. */
  onEncounterStatusChange?: (status: string) => void
}

export function EncounterDetailModal({
  encounterId,
  appointmentId,
  patientId,
  isOpen,
  onClose,
  onJoinTelemedicine,
  canJoinTelemedicine = false,
  onEncounterStatusChange,
}: EncounterDetailModalProps) {
  const { t, language } = useT()
  const { role } = useAuth()
  const pathname = usePathname()
  const localeTag = language === 'es' ? 'es-ES' : 'en-US'
  const i693Href = useMemo(
    () =>
      buildI693Href(
        pathname.startsWith('/admin') ? '/admin/i-693' : getI693BasePath(role),
        { encounterId, tab: 'form' }
      ),
    [pathname, role, encounterId]
  )
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [intake, setIntake] = useState<IntakeForm | null>(null)
  const [vitals, setVitals] = useState<Vitals | null>(null)
  const [soapNotes, setSoapNotes] = useState<SOAPNotes | null>(null)
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [pharmacies, setPharmacies] = useState<PharmacyRecord[]>([])

  type IcdSuggestionRow = {
    code: string
    description: string
    confidence: number
    reasoning: string
  }
  const [icdSuggestions, setIcdSuggestions] = useState<IcdSuggestionRow[] | null>(null)
  const [icdLoading, setIcdLoading] = useState(false)
  const [icdMessage, setIcdMessage] = useState<string | null>(null)
  const [modalTab, setModalTab] = useState<'details' | 'forms'>('details')
  const [completingEncounter, setCompletingEncounter] = useState(false)

  const showI693Form = useMemo(() => {
    if (!encounter) return false
    return isImmigrationEncounterForI693({
      consent_ack: encounter.consent_ack,
      program_type: encounter.program_type,
      appointments: appointment ? { services: appointment.services ?? null } : null,
    })
  }, [encounter, appointment])

  const intakeSeverityBand = useMemo(
    () => severityBandFromIntake(intake?.severity),
    [intake?.severity]
  )

  useEffect(() => {
    setModalTab('details')
  }, [encounterId])

  useEffect(() => {
    if (!isOpen) return

    const fetchData = async () => {
      setLoading(true)
      try {
        // Patient demographics: encounter → appointment → patients (schema)
        const { data: appointmentData, error: appointmentError } = await supabase
          .from('appointments')
          .select(
            `id, appointment_date, appointment_time, onsite_type, patient_id,
            services:service_id ( title_en, title_es ),
            patients:patient_id (
              id, first_name, last_name, email, phone, gender, date_of_birth,
              zip_code, state, street_address, patient_code
            )`
          )
          .eq('id', appointmentId)
          .single()

        if (appointmentError) {
          console.error('Error fetching appointment:', appointmentError)
        }

        if (appointmentData) {
          setAppointment({
            id: appointmentData.id,
            appointment_date: appointmentData.appointment_date,
            appointment_time: appointmentData.appointment_time,
            onsite_type: appointmentData.onsite_type,
            services: appointmentData.services as Appointment['services'],
          })
          const linkedPatient = appointmentData.patients
          if (linkedPatient && typeof linkedPatient === 'object' && !Array.isArray(linkedPatient)) {
            setPatient(linkedPatient as Patient)
          }
        }
        const { data: encounterData } = await supabase
          .from('encounters')
          .select('*')
          .eq('id', encounterId)
          .single()

        const encTyped = encounterData as Encounter
        setEncounter(encTyped)

        const { data: pharmList } = await supabase
          .from('pharmacy')
          .select('id, name, address, city, state, zip_code, phone, phone_number, email, is_active')
          .or('is_active.is.null,is_active.eq.true')
          .order('name')
        let pharmacyRegistry = ((pharmList as Record<string, unknown>[]) ?? []).map((row) =>
          normalizePharmacyRow(row)
        )

        // Fetch intake form: try encounter.intake_id first, then by appointment_id (intake_form links to appointment)
        let intakeData: unknown = null
        if (encounterData?.intake_id) {
          const res = await supabase
            .from('intake_form')
            .select('*')
            .eq('id', encounterData.intake_id)
            .maybeSingle()
          if (res.error) console.error('Error fetching intake form by id:', res.error)
          intakeData = res.data
        }
        if (!intakeData && appointmentId) {
          const res = await supabase
            .from('intake_form')
            .select('*')
            .eq('appointment_id', appointmentId)
            .maybeSingle()
          if (res.error) console.error('Error fetching intake form by appointment:', res.error)
          intakeData = res.data
        }
        if (intakeData) {
          setIntake(intakeData as IntakeForm)
        }

        // Fetch vitals
        const { data: vitalsData, error: vitalsError } = await supabase
          .from('vitals')
          .select('*')
          .eq('encounter_id', encounterId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (vitalsError) {
          console.error('Error fetching vitals:', vitalsError)
        } else if (vitalsData) {
          setVitals(vitalsData as Vitals)
        }

        // Fetch SOAP notes by encounter_id (table links to encounters.id)
        let soapData: SOAPNotes | null = null
        let soapError: { message: string } | null = null

        const { data: soapByEncounter, error: soapErrEncounter } = await supabase
          .from('ai_soapnotes')
          .select('*')
          .eq('encounter_id', encounterId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (soapErrEncounter) {
          // Fallback: some schemas use appointment_id instead of encounter_id
          const { data: soapByAppt, error: soapErrAppt } = await supabase
            .from('ai_soapnotes')
            .select('*')
            .eq('appointment_id', appointmentId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!soapErrAppt && soapByAppt) {
            soapData = soapByAppt as SOAPNotes
          } else {
            soapError = soapErrEncounter
          }
        } else if (soapByEncounter) {
          soapData = soapByEncounter as SOAPNotes
        }

        if (soapError) {
          console.error('Error fetching SOAP notes:', soapError)
        }
        setSoapNotes(soapData)

        // Fetch pharmacy if pharmacy_id exists
        if (encounterData?.pharmacy_id) {
          const { data: pharmacyData, error: pharmacyError } = await supabase
            .from('pharmacy')
            .select('*')
            .eq('id', encounterData.pharmacy_id)
            .maybeSingle()

          if (pharmacyError) {
            console.error('Error fetching pharmacy:', pharmacyError)
            setPharmacy(null)
          } else if (pharmacyData) {
            setPharmacy(pharmacyData as Pharmacy)
            pharmacyRegistry = mergePharmacyIntoList(
              pharmacyRegistry,
              normalizePharmacyRow(pharmacyData as Record<string, unknown>)
            )
          } else {
            setPharmacy(null)
          }
        } else {
          setPharmacy(null)
        }

        setPharmacies(pharmacyRegistry)

      } catch (error) {
        console.error('Error fetching encounter details:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isOpen, encounterId, appointmentId, supabase])

  const reloadPharmacyRegistry = useCallback(async () => {
    const { data: pharmList } = await supabase
      .from('pharmacy')
      .select('id, name, address, city, state, zip_code, phone, phone_number, email, is_active')
      .or('is_active.is.null,is_active.eq.true')
      .order('name')
    setPharmacies(
      ((pharmList as Record<string, unknown>[]) ?? []).map((row) => normalizePharmacyRow(row))
    )
  }, [supabase])

  const refreshEncounterAndPharmacy = useCallback(async () => {
    const { data: enc } = await supabase.from('encounters').select('*').eq('id', encounterId).single()
    if (!enc) return
    setEncounter(enc as Encounter)
    const pid = (enc as Encounter).pharmacy_id

    await reloadPharmacyRegistry()

    if (pid) {
      const { data: pharmacyData } = await supabase.from('pharmacy').select('*').eq('id', pid).maybeSingle()
      const normalized = pharmacyData
        ? normalizePharmacyRow(pharmacyData as Record<string, unknown>)
        : null
      setPharmacy((pharmacyData as Pharmacy) ?? null)
      if (normalized) {
        setPharmacies((prev) => mergePharmacyIntoList(prev, normalized))
      }
    } else {
      setPharmacy(null)
    }
  }, [encounterId, supabase, reloadPharmacyRegistry])

  const canEditSoap = useMemo(() => {
    if (!encounter) return false
    if (!canEditSoapByRole(role)) return false
    return canEditEncounterSoap(encounter.status, role)
  }, [encounter, role])

  const canCompleteEncounter = useMemo(() => {
    if (!encounter) return false
    return (role === 'doctor' || role === 'admin') && canDoctorCompleteEncounter(encounter.status)
  }, [encounter, role])

  const handleCompleteEncounter = useCallback(async () => {
    if (!canCompleteEncounter || completingEncounter) return
    if (!window.confirm(t('encounter_modal.complete_confirm'))) return

    setCompletingEncounter(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/complete`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('encounter_modal.complete_failed'))

      setEncounter((prev) => (prev ? { ...prev, status: 'completed' } : prev))
      onEncounterStatusChange?.('completed')
    } catch (error) {
      console.error('Error completing encounter:', error)
      alert(error instanceof Error ? error.message : t('encounter_modal.complete_failed'))
    } finally {
      setCompletingEncounter(false)
    }
  }, [canCompleteEncounter, completingEncounter, encounterId, onEncounterStatusChange, t])

  const canEditPatientInfo = canEditSoap

  /** ICD-10-CM suggestions from intake + SOAP subjective (one request per modal open). */
  useEffect(() => {
    if (!isOpen || loading) return
    let cancelled = false
    setIcdSuggestions(null)
    setIcdMessage(null)
    setIcdLoading(true)

    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const headers: Record<string, string> = {}
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
        const res = await fetch(`/api/encounters/${encounterId}/icd-suggestions`, {
          credentials: 'include',
          headers,
        })
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          icd_suggestions?: IcdSuggestionRow[]
          message?: string
          error?: string
        }
        if (cancelled) return
        if (json.ok && Array.isArray(json.icd_suggestions) && json.icd_suggestions.length > 0) {
          setIcdSuggestions(json.icd_suggestions)
          setIcdMessage(null)
        } else {
          setIcdSuggestions(null)
          setIcdMessage(
            json.message ||
              json.error ||
              (!res.ok
                ? t('encounter_modal.icd_request_failed', { status: String(res.status) })
                : t('encounter_modal.icd_ai_empty'))
          )
        }
      } catch {
        if (!cancelled) {
          setIcdSuggestions(null)
          setIcdMessage(t('encounter_modal.icd_load_error'))
        }
      } finally {
        if (!cancelled) setIcdLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, loading, encounterId, supabase, t])

  const patientAgeYears = useMemo(
    () => (patient?.date_of_birth ? patientAgeFromDob(patient.date_of_birth) : null),
    [patient?.date_of_birth]
  )

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('common.na')
    return new Date(dateString).toLocaleDateString(localeTag, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const handleDownloadDoctorSoapPdf = useCallback(
    async (soap: {
      subjective_text: string
      objective_text: string
      assessment_text: string
      plan_text: string
    }) => {
      const formatDateOnly = (dateString: string | null) => {
        if (!dateString) return t('common.na')
        return new Date(dateString).toLocaleDateString(localeTag, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      }
      const generated = formatClinicDateTimeForLanguage(new Date(), language)
      const addr =
        [patient?.street_address, patient?.state, patient?.zip_code].filter(Boolean).join(', ') ||
        t('common.na')
      const apptTypeRaw = (appointment?.onsite_type || '').toLowerCase()
      let apptType = t('common.na')
      if (apptTypeRaw === 'onsite') apptType = t('encounter_modal.type_onsite')
      else if (apptTypeRaw === 'offsite') apptType = t('encounter_modal.type_offsite')
      else if (apptTypeRaw === 'telemedicine') apptType = t('encounter_modal.type_telemedicine')
      else if (appointment?.onsite_type) apptType = appointment.onsite_type

      const { downloadAiSoapPdf } = await import('@/lib/pdf/download-ai-soap-pdf')

      await downloadAiSoapPdf(
        {
          title: t('encounter_modal.doctor_soap_notes'),
          generatedLine: t('encounter_modal.pdf_generated', { date: generated }),
          patientSectionTitle: t('encounter_modal.patient_info'),
          patientRows: [
            {
              label: t('common.name'),
              value: patient ? `${patient.first_name} ${patient.last_name}`.trim() : t('common.na'),
            },
            { label: t('encounter_modal.patient_code'), value: patient?.patient_code || t('common.na') },
            { label: t('common.dob'), value: formatDateOnly(patient?.date_of_birth ?? null) },
            { label: t('common.age'), value: patientAgeYears != null ? String(patientAgeYears) : t('common.na') },
            { label: t('common.gender'), value: patient?.gender || t('common.na') },
            { label: t('common.phone'), value: patient?.phone || t('common.na') },
            { label: t('common.email'), value: patient?.email || t('common.na') },
            { label: t('common.address'), value: addr },
          ],
          visitSectionTitle: t('encounter_modal.appointment_info'),
          visitRows: [
            { label: t('orders.encounter_id'), value: String(encounterId) },
            { label: t('encounter_modal.encounter_code'), value: encounter?.encounter_code || t('common.na') },
            { label: t('common.date'), value: formatDateOnly(appointment?.appointment_date ?? null) },
            { label: t('common.time'), value: appointment?.appointment_time?.trim() || t('common.na') },
            { label: t('common.type'), value: apptType },
          ],
          sections: [
            {
              title: t('encounter_modal.soap_subjective'),
              body: soap.subjective_text.trim() || t('encounter_modal.soap_placeholder'),
            },
            {
              title: t('encounter_modal.soap_objective'),
              body: soap.objective_text.trim() || t('encounter_modal.soap_placeholder'),
            },
            {
              title: t('encounter_modal.soap_assessment'),
              body: soap.assessment_text.trim() || t('encounter_modal.soap_placeholder'),
            },
            {
              title: t('encounter_modal.soap_plan'),
              body: soap.plan_text.trim() || t('encounter_modal.soap_placeholder'),
            },
          ],
        },
        `Doctor-SOAP-${(encounter?.encounter_code || String(encounterId)).replace(/[^a-zA-Z0-9-_]+/g, '_')}.pdf`
      )
    },
    [patient, encounter, appointment, encounterId, patientAgeYears, t, localeTag, language]
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-slate-900/40 backdrop-blur-[2px] lg:p-4">
      <div className="bg-white border border-slate-200 rounded-t-2xl lg:rounded-2xl w-full lg:max-w-6xl h-[94dvh] lg:h-[90vh] flex flex-col overflow-hidden shadow-xl shadow-slate-300/40">
        {/* Header */}
        <div className="flex items-center justify-between px-4 lg:px-6 py-3 lg:py-4 border-b border-slate-100 bg-[#f9fbff] flex-shrink-0">
          {/* Mobile drag handle */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-slate-200 lg:hidden" aria-hidden />
          <div className="flex items-center gap-2 lg:gap-4 flex-wrap mt-1 lg:mt-0">
            <h2 className="text-base lg:text-xl font-bold text-slate-900 tracking-tight">{t('encounter_modal.title')}</h2>
            {encounter?.encounter_code && (
              <span className="text-xs lg:text-sm text-[#2E6EF3] font-mono font-medium">#{encounter.encounter_code}</span>
            )}
            {encounter?.status && (
              <span
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  encounter.status === 'appointment_initiated'
                    ? 'bg-fuchsia-50 text-fuchsia-900 border-fuchsia-200'
                    : encounter.status === 'provider_assigned'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : encounter.status === 'vitals_assessed'
                        ? 'bg-lime-50 text-lime-900 border-lime-200'
                        : encounter.status === 'in_consultation'
                          ? 'bg-yellow-50 text-yellow-900 border-yellow-200'
                          : encounter.status === 'consultation_concluded'
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : encounter.status === 'final_review'
                              ? 'bg-teal-50 text-teal-900 border-teal-200'
                              : encounter.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-orange-50 text-orange-900 border-orange-200'
                }`}
              >
                {getStatusInfo(encounter.status as EncounterStatus)?.label ?? encounter.status}
              </span>
            )}
            {!loading && intakeSeverityBand && (
              <span
                className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                  intakeSeverityBand === 'high'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : intakeSeverityBand === 'medium'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                {t('encounter_modal.risk_prefix')}{' '}
                {intakeSeverityBand === 'high'
                  ? t('encounter_modal.risk_high')
                  : intakeSeverityBand === 'medium'
                    ? t('encounter_modal.risk_medium')
                    : t('encounter_modal.risk_low')}
              </span>
            )}
            {!loading && !intakeSeverityBand && intake && intake.severity == null && (
              <span className="text-xs text-slate-500">{t('encounter_modal.severity_not_set')}</span>
            )}
            {!loading && !intakeSeverityBand && !intake && (
              <span className="text-xs text-slate-500">{t('encounter_modal.risk_needs_intake')}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!loading && showI693Form && (
              <Link
                href={i693Href}
                className="px-4 py-2 border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-xl text-sm font-semibold hover:bg-emerald-100 transition-colors"
              >
                {t('i693.open_form')}
              </Link>
            )}
            {canCompleteEncounter && (
              <button
                type="button"
                onClick={() => void handleCompleteEncounter()}
                disabled={completingEncounter}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {completingEncounter ? t('encounter_modal.completing') : t('encounter_modal.complete_encounter')}
              </button>
            )}
            {onJoinTelemedicine && canJoinTelemedicine && (
              <button
                type="button"
                onClick={onJoinTelemedicine}
                className="px-4 py-2 bg-[#2E6EF3] text-white rounded-xl text-sm font-semibold hover:bg-[#256ae8] transition-colors flex items-center gap-2 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EF3]/50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {t('encounter_modal.join_telemedicine')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E6EF3]/50"
              aria-label={t('common.close')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#f5f7fb]">
          {!loading && (
            <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-slate-200 shrink-0 bg-[#f5f7fb]">
              <button
                type="button"
                onClick={() => setModalTab('details')}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                  modalTab === 'details'
                    ? 'bg-white text-slate-900 border border-slate-200 border-b-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t('encounter_modal.tab_details')}
              </button>
              <button
                type="button"
                onClick={() => setModalTab('forms')}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                  modalTab === 'forms'
                    ? 'bg-white text-slate-900 border border-slate-200 border-b-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t('encounter_modal.tab_forms')}
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-full min-h-[200px]">
                <LoadingSpinner message={t('encounter_modal.loading')} variant="light" />
              </div>
            ) : modalTab === 'forms' ? (
              <EncounterConsentFormsTab encounterId={encounterId} />
            ) : (
            <div className="space-y-6">
              {/* Risk alerts — first in scroll so it cannot be missed */}
              <div
                id="encounter-risk-alerts"
                className="rounded-xl border border-rose-200 bg-rose-50/90 p-6 shadow-sm ring-1 ring-rose-100"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                    <svg className="w-5 h-5 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {t('encounter_modal.risk_alerts')}
                    <span className="text-xs font-normal text-rose-700/90 rounded-md bg-white/80 px-2 py-0.5 border border-rose-200">
                      {t('encounter_modal.ai_diagnose_tag')}
                    </span>
                  </h3>
                </div>
                {!intake && (
                  <p className="text-rose-900/85 text-sm mb-3">{t('encounter_modal.severity_derived_when_intake')}</p>
                )}
                {intake && intakeSeverityBand && (
                  <div className="space-y-3">
                    <div
                      className="flex rounded-lg overflow-hidden border border-slate-200 bg-white"
                      title="From intake severity: 1–3 Low, 4–7 Medium, 8–10 High"
                    >
                      {(['low', 'medium', 'high'] as const).map((step) => (
                        <div
                          key={step}
                          className={`flex-1 py-2 text-center text-xs font-semibold capitalize ${
                            intakeSeverityBand === step
                              ? step === 'high'
                                ? 'bg-red-100 text-red-900'
                                : step === 'medium'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-emerald-100 text-emerald-900'
                              : 'text-slate-400'
                          }`}
                        >
                          {step === 'high'
                            ? t('encounter_modal.band_high')
                            : step === 'medium'
                              ? t('encounter_modal.band_medium')
                              : t('encounter_modal.band_low')}
                        </div>
                      ))}
                    </div>
                    <div
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold border ${
                        intakeSeverityBand === 'high'
                          ? 'bg-red-50 border-red-200 text-red-900'
                          : intakeSeverityBand === 'medium'
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      }`}
                    >
                      <span className="uppercase tracking-wide text-xs opacity-90">{t('encounter_modal.level_label')}</span>
                      <span>
                        {intakeSeverityBand === 'high'
                          ? t('encounter_modal.risk_high')
                          : intakeSeverityBand === 'medium'
                            ? t('encounter_modal.risk_medium')
                            : t('encounter_modal.risk_low')}
                      </span>
                    </div>
                  </div>
                )}
                {intake && intake.severity == null && (
                  <p className="text-rose-900/85 text-sm">{t('encounter_modal.severity_hint_add_score')}</p>
                )}
                {intake && intake.severity != null && !intakeSeverityBand && (
                  <p className="text-amber-900 text-sm">{t('encounter_modal.severity_invalid_range')}</p>
                )}
              </div>

              {/* ICD-10-CM suggestions (AI-assisted, from intake + SOAP subjective) */}
              <div
                id="encounter-icd-suggestions"
                className="rounded-xl border border-sky-200 bg-sky-50/90 p-6 shadow-sm ring-1 ring-sky-100"
              >
                <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2 flex-wrap">
                  <svg className="w-5 h-5 text-sky-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {t('encounter_modal.icd_title')}
                  <span className="text-xs font-normal text-sky-800/90">{t('encounter_modal.icd_disclaimer')}</span>
                </h3>
                {icdLoading && (
                  <p className="text-sky-900/80 text-sm mt-3">{t('encounter_modal.loading_suggestions')}</p>
                )}
                {!icdLoading && icdMessage && !icdSuggestions?.length && (
                  <p className="text-amber-900 text-sm mt-3">{icdMessage}</p>
                )}
                {!icdLoading && icdSuggestions && icdSuggestions.length > 0 && (
                  <ul className="mt-4 space-y-4">
                    {icdSuggestions.map((row, idx) => (
                      <li
                        key={`${row.code}-${idx}`}
                        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                          <span className="font-mono text-lg font-semibold text-[#2E6EF3]">{row.code}</span>
                          <span className="text-xs text-slate-500">
                            {t('encounter_modal.icd_confidence')}{' '}
                            <span className="text-sky-800 font-medium">{row.confidence}%</span>
                          </span>
                        </div>
                        <p className="text-slate-900 font-medium text-sm mb-1">{row.description}</p>
                        <p className="text-slate-600 text-xs leading-relaxed">{row.reasoning}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Appointment Details */}
              {appointment && (
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {t('encounter_modal.appointment_info')}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-slate-500 text-sm mb-1">{t('common.date')}</p>
                      <p className="text-slate-900 font-semibold">{formatDate(appointment.appointment_date)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-sm mb-1">{t('common.time')}</p>
                      <p className="text-slate-900 font-semibold">
                        {appointment.appointment_time
                          ? formatClinicTimeSlot(appointment.appointment_time)
                          : t('common.na')}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-sm mb-1">{t('common.type')}</p>
                      <p className="text-slate-900 font-semibold">
                        <span
                          className={`inline-flex px-3 py-1 rounded-lg text-sm border ${
                            appointment.onsite_type === 'onsite'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-blue-50 text-[#2E6EF3] border-blue-200'
                          }`}
                        >
                          {appointment.onsite_type === 'onsite'
                            ? t('encounter_modal.type_onsite')
                            : t('encounter_modal.type_offsite')}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <EncounterPatientInfoPanel
                encounterId={encounterId}
                canEdit={canEditPatientInfo}
                encounterStatus={encounter?.status ?? null}
                onPatientUpdated={(updated) => setPatient(updated)}
              />

              {encounter && (
                <EncounterRoomingPanel
                  encounterId={encounterId}
                  encounter={encounter}
                  onUpdated={async () => {
                    const { data: enc } = await supabase
                      .from('encounters')
                      .select('*')
                      .eq('id', encounterId)
                      .single()
                    if (enc) setEncounter(enc as Encounter)
                  }}
                />
              )}

              {encounter && (
                <EncounterPrescriptionsPanel
                  encounterId={encounterId}
                  encounterStatus={encounter.status}
                  hasDoctor={encounter.doctor_id != null}
                  hasPharmacy={encounter.pharmacy_id != null}
                  pharmacyId={encounter.pharmacy_id}
                  assignedPharmacy={
                    pharmacy ? normalizePharmacyRow(pharmacy as Record<string, unknown>) : null
                  }
                  pharmacies={pharmacies}
                  onPharmacyUpdated={refreshEncounterAndPharmacy}
                  onPharmaciesReload={reloadPharmacyRegistry}
                />
              )}

              {/* Intake Form */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {t('encounter_modal.intake_form')}
                </h3>
                {intake ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.chief_complaint')}</p>
                      <p className="text-slate-900">{intake.chief_complaint || t('common.na')}</p>
                    </div>
                    {intake.symptoms_description && (
                      <div>
                        <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.symptoms_description')}</p>
                        <p className="text-slate-900">{intake.symptoms_description}</p>
                      </div>
                    )}
                    {intake.location && (
                      <div>
                        <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.location')}</p>
                        <p className="text-slate-900">{intake.location}</p>
                      </div>
                    )}
                    {intake.severity && (
                      <div>
                        <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.severity')}</p>
                        <p className="text-slate-900">{intake.severity}/10</p>
                      </div>
                    )}
                    {intake.onset && (
                      <div>
                        <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.onset')}</p>
                        <p className="text-slate-900">{formatDate(intake.onset)}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {intake.medical_conditions && (
                        <div>
                          <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.medical_conditions')}</p>
                          <p className="text-slate-900 text-sm">
                            {Array.isArray(intake.medical_conditions)
                              ? intake.medical_conditions.join(', ')
                              : t('common.na')}
                          </p>
                        </div>
                      )}
                      {intake.allergies && (
                        <div>
                          <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.allergies')}</p>
                          <p className="text-slate-900 text-sm">
                            {Array.isArray(intake.allergies) ? intake.allergies.join(', ') : t('common.na')}
                          </p>
                        </div>
                      )}
                      {intake.current_medications && (
                        <div>
                          <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.current_medications')}</p>
                          <p className="text-slate-900 text-sm">
                            {Array.isArray(intake.current_medications)
                              ? intake.current_medications.join(', ')
                              : t('common.na')}
                          </p>
                        </div>
                      )}
                      {intake.surgeries && (
                        <div>
                          <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.surgeries')}</p>
                          <p className="text-slate-900 text-sm">
                            {Array.isArray(intake.surgeries) ? intake.surgeries.join(', ') : t('common.na')}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-200">
                      <div>
                        <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.tobacco_use')}</p>
                        <p className="text-slate-900">{intake.tobacco_use ? t('encounter_modal.yes') : t('encounter_modal.no')}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.alcohol_use')}</p>
                        <p className="text-slate-900">{intake.alcohol_use ? t('encounter_modal.yes') : t('encounter_modal.no')}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-sm mb-1">{t('encounter_modal.drug_use')}</p>
                        <p className="text-slate-900">{intake.drug_use ? t('encounter_modal.yes') : t('encounter_modal.no')}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-600">{t('encounter_modal.intake_not_available')}</p>
                )}
              </div>

              {/* Vitals */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  {t('patient_file.vitals')}
                </h3>
                {vitals ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-slate-500 text-sm mb-1">{t('patient_file.bp')}</p>
                      <p className="text-slate-900 font-semibold">
                        {vitals.bp_systolic && vitals.bp_diastolic
                          ? `${vitals.bp_systolic}/${vitals.bp_diastolic} mmHg`
                          : t('common.na')}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-sm mb-1">{t('patient_file.hr')}</p>
                      <p className="text-slate-900 font-semibold">
                        {vitals.heart_rate ? `${vitals.heart_rate} bpm` : t('common.na')}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-sm mb-1">{t('patient_file.temp')}</p>
                      <p className="text-slate-900 font-semibold">
                        {vitals.temperature
                          ? `${vitals.temperature}°${vitals.temperature_unit || 'F'}`
                          : t('common.na')}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-sm mb-1">{t('patient_file.spo2')}</p>
                      <p className="text-slate-900 font-semibold">
                        {vitals.spo2 ? `${vitals.spo2}%` : t('common.na')}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-sm mb-1">{t('patient_file.rr')}</p>
                      <p className="text-slate-900 font-semibold">
                        {vitals.respiratory_rate ? `${vitals.respiratory_rate} /min` : t('common.na')}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-sm mb-1">{t('patient_file.weight')}</p>
                      <p className="text-slate-900 font-semibold">
                        {vitals.weight ? `${vitals.weight} ${vitals.weight_unit || 'lbs'}` : t('common.na')}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-sm mb-1">{t('patient_file.height')}</p>
                      <p className="text-slate-900 font-semibold">
                        {vitals.height ? `${vitals.height} ${vitals.height_unit || 'in'}` : t('common.na')}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-sm mb-1">{t('patient_file.bmi')}</p>
                      <p className="text-slate-900 font-semibold">
                        {vitals.bmi ? vitals.bmi.toFixed(1) : t('common.na')}
                      </p>
                    </div>
                    {vitals.notes && (
                      <div className="col-span-full">
                        <p className="text-slate-500 text-sm mb-1">{t('common.notes')}</p>
                        <p className="text-slate-900">{vitals.notes}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-600">{t('encounter_modal.vitals_not_recorded')}</p>
                )}
              </div>

              <EncounterSoapPanel
                encounterId={encounterId}
                aiSoap={soapNotes}
                canEdit={canEditSoap}
                encounterStatus={encounter?.status ?? null}
                onDownloadDoctorPdf={(soap) => void handleDownloadDoctorSoapPdf(soap)}
              />

            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
