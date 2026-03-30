'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner } from './LoadingSpinner'
import { getStatusInfo, type EncounterStatus } from '@/lib/encounter-status'
import { EncounterRoomingPanel } from './EncounterRoomingPanel'
import { EncounterConsentFormsTab } from './EncounterConsentFormsTab'

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
  status: string
  encounter_code: string | null
  created_at: string
  identity_verified_at?: string | null
  prescribing_location_ack_at?: string | null
  ma_supervision_ack_at?: string | null
  ready_for_doctor_at?: string | null
  ma_exam_findings?: string | null
  consent_ack?: Record<string, string> | null
  risk_level?: string | null
  risk_rationale?: string | null
  risk_factors?: string[] | null
  risk_assessed_at?: string | null
}

interface Appointment {
  id: number
  appointment_date: string | null
  appointment_time: string | null
  onsite_type: string
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
}

export function EncounterDetailModal({
  encounterId,
  appointmentId,
  patientId,
  isOpen,
  onClose,
  onJoinTelemedicine,
  canJoinTelemedicine = false,
}: EncounterDetailModalProps) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [intake, setIntake] = useState<IntakeForm | null>(null)
  const [vitals, setVitals] = useState<Vitals | null>(null)
  const [soapNotes, setSoapNotes] = useState<SOAPNotes | null>(null)
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [pharmacies, setPharmacies] = useState<{ id: number; name: string | null }[]>([])

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
        // Fetch patient
        const { data: patientData } = await supabase
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .single()

        setPatient(patientData as Patient)

        // Fetch encounter
        const { data: encounterData } = await supabase
          .from('encounters')
          .select('*')
          .eq('id', encounterId)
          .single()

        const encTyped = encounterData as Encounter
        setEncounter(encTyped)

        const { data: pharmList } = await supabase.from('pharmacy').select('id, name').order('name')
        setPharmacies((pharmList as { id: number; name: string | null }[]) ?? [])

        // Fetch appointment to get onsite_type
        const { data: appointmentData } = await supabase
          .from('appointments')
          .select('id, appointment_date, appointment_time, onsite_type')
          .eq('id', appointmentId)
          .single()

        if (appointmentData) {
          setAppointment(appointmentData as Appointment)
        }

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
          } else if (pharmacyData) {
            setPharmacy(pharmacyData as Pharmacy)
          }
        }

      } catch (error) {
        console.error('Error fetching encounter details:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isOpen, encounterId, appointmentId, patientId, supabase])

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
            json.message || json.error || (!res.ok ? `Request failed (${res.status})` : "AI can't find ICD code")
          )
        }
      } catch {
        if (!cancelled) {
          setIcdSuggestions(null)
          setIcdMessage('Could not load ICD suggestions')
        }
      } finally {
        if (!cancelled) setIcdLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, loading, encounterId, supabase])

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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // Normalize AI SOAP text so it doesn't repeat headings like "**Subjective:**"
  const cleanSoapSection = (text: string | null, section: 'subjective' | 'objective' | 'assessment' | 'plan'): string | null => {
    if (!text) return null

    // Build a label-specific regex that matches patterns like:
    // "**Subjective:** ", "Subjective:", "subjective  -", etc.
    let label: string
    switch (section) {
      case 'subjective':
        label = 'subjective'
        break
      case 'objective':
        label = 'objective'
        break
      case 'assessment':
        label = 'assessment'
        break
      case 'plan':
        label = 'plan'
        break
    }

    const pattern = new RegExp(
      String.raw`^\\s*(\\*\\*)?\\s*${label}\\s*:?\\s*(\\*\\*)?\\s*`,
      'i'
    )

    return text.replace(pattern, '').trim()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 border border-white/20 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-800 flex-shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-2xl font-bold text-white">Encounter Details</h2>
            {encounter?.encounter_code && (
              <span className="text-sm text-blue-300 font-mono">#{encounter.encounter_code}</span>
            )}
            {encounter?.status && (
              <span
                className={`px-3 py-1.5 rounded-lg text-sm font-medium text-white border ${
                  encounter.status === 'appointment_initiated' ? 'bg-gray-500/20 border-gray-500/50' :
                  encounter.status === 'provider_assigned' ? 'bg-blue-500/20 border-blue-500/50' :
                  encounter.status === 'vitals_assessed' ? 'bg-purple-500/20 border-purple-500/50' :
                  encounter.status === 'in_consultation' ? 'bg-yellow-500/20 border-yellow-500/50' :
                  encounter.status === 'consultation_concluded' ? 'bg-orange-500/20 border-orange-500/50' :
                  encounter.status === 'final_review' ? 'bg-cyan-500/20 border-cyan-500/50' :
                  encounter.status === 'completed' ? 'bg-green-500/20 border-green-500/50' :
                  'bg-white/10 border-white/20'
                }`}
              >
                {getStatusInfo(encounter.status as EncounterStatus)?.label ?? encounter.status}
              </span>
            )}
            {!loading && intakeSeverityBand && (
              <span
                className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                  intakeSeverityBand === 'high'
                    ? 'bg-red-500/25 border-red-400/55 text-red-100'
                    : intakeSeverityBand === 'medium'
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-100'
                      : 'bg-emerald-500/15 border-emerald-400/45 text-emerald-100'
                }`}
              >
                Risk: {intakeSeverityBand === 'high' ? 'High' : intakeSeverityBand === 'medium' ? 'Medium' : 'Low'}
              </span>
            )}
            {!loading && !intakeSeverityBand && intake && intake.severity == null && (
              <span className="text-xs text-slate-400">Severity not set on intake</span>
            )}
            {!loading && !intakeSeverityBand && !intake && (
              <span className="text-xs text-slate-500">Risk: needs intake (severity 1–10)</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {onJoinTelemedicine && canJoinTelemedicine && (
              <button
                onClick={onJoinTelemedicine}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Join Telemedicine
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {!loading && (
            <div className="flex gap-2 px-6 pt-3 pb-0 border-b border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setModalTab('details')}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                  modalTab === 'details'
                    ? 'bg-white/10 text-white border border-b-0 border-white/15'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => setModalTab('forms')}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                  modalTab === 'forms'
                    ? 'bg-white/10 text-white border border-b-0 border-white/15'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Forms
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-full min-h-[200px]">
                <LoadingSpinner message="Loading encounter details..." />
              </div>
            ) : modalTab === 'forms' ? (
              <EncounterConsentFormsTab encounterId={encounterId} />
            ) : (
            <div className="space-y-6">
              {/* Risk alerts — first in scroll so it cannot be missed */}
              <div
                id="encounter-risk-alerts"
                className="bg-gradient-to-br from-rose-950/40 to-slate-900/80 border border-rose-500/30 rounded-xl p-6 ring-1 ring-rose-500/20"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2 flex-wrap">
                    <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Risk alerts
                    <span className="text-xs font-normal text-rose-200/80">ai diagnose</span>
                  </h3>
                </div>
                {!intake && (
                  <p className="text-rose-200/90 text-sm mb-3">
                    Severity (Low / Medium / High) is derived from the intake form once it is available.
                  </p>
                )}
                {intake && intakeSeverityBand && (
                  <div className="space-y-3">
                    <div
                      className="flex rounded-lg overflow-hidden border border-white/15 bg-black/20"
                      title="From intake severity: 1–3 Low, 4–7 Medium, 8–10 High"
                    >
                      {(['low', 'medium', 'high'] as const).map((step) => (
                        <div
                          key={step}
                          className={`flex-1 py-2 text-center text-xs font-semibold capitalize ${
                            intakeSeverityBand === step
                              ? step === 'high'
                                ? 'bg-red-500/50 text-white'
                                : step === 'medium'
                                  ? 'bg-amber-500/45 text-white'
                                  : 'bg-emerald-500/40 text-white'
                              : 'text-white/35'
                          }`}
                        >
                          {step}
                        </div>
                      ))}
                    </div>
                    <div
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold border ${
                        intakeSeverityBand === 'high'
                          ? 'bg-red-500/25 border-red-400/60 text-red-100'
                          : intakeSeverityBand === 'medium'
                            ? 'bg-amber-500/20 border-amber-400/50 text-amber-100'
                            : 'bg-emerald-500/15 border-emerald-400/45 text-emerald-100'
                      }`}
                    >
                      <span className="uppercase tracking-wide text-xs opacity-90">Level</span>
                      <span>
                        {intakeSeverityBand === 'high'
                          ? 'High'
                          : intakeSeverityBand === 'medium'
                            ? 'Medium'
                            : 'Low'}
                      </span>
                    </div>
                  </div>
                )}
                {intake && intake.severity == null && (
                  <p className="text-rose-200/80 text-sm">Add a severity score (1–10) on the intake form to see Low / Medium / High.</p>
                )}
                {intake && intake.severity != null && !intakeSeverityBand && (
                  <p className="text-amber-200/90 text-sm">
                    Severity must be between 1 and 10 to classify this encounter.
                  </p>
                )}
              </div>

              {/* ICD-10-CM suggestions (AI-assisted, from intake + SOAP subjective) */}
              <div
                id="encounter-icd-suggestions"
                className="bg-gradient-to-br from-cyan-950/35 to-slate-900/80 border border-cyan-500/25 rounded-xl p-6 ring-1 ring-cyan-500/15"
              >
                <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2 flex-wrap">
                  <svg className="w-5 h-5 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  ICD-10-CM suggestions
                  <span className="text-xs font-normal text-cyan-200/75">(AI — pre-clinical, not for billing without review)</span>
                </h3>
                {icdLoading && (
                  <p className="text-cyan-100/80 text-sm mt-3">Loading suggestions…</p>
                )}
                {!icdLoading && icdMessage && !icdSuggestions?.length && (
                  <p className="text-amber-200/90 text-sm mt-3">{icdMessage}</p>
                )}
                {!icdLoading && icdSuggestions && icdSuggestions.length > 0 && (
                  <ul className="mt-4 space-y-4">
                    {icdSuggestions.map((row, idx) => (
                      <li
                        key={`${row.code}-${idx}`}
                        className="rounded-lg border border-white/10 bg-black/20 p-4"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                          <span className="font-mono text-lg font-semibold text-cyan-300">{row.code}</span>
                          <span className="text-xs text-slate-400">
                            Confidence: <span className="text-cyan-200/90">{row.confidence}%</span>
                          </span>
                        </div>
                        <p className="text-white font-medium text-sm mb-1">{row.description}</p>
                        <p className="text-slate-300 text-xs leading-relaxed">{row.reasoning}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Appointment Details */}
              {appointment && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Appointment Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Date</p>
                      <p className="text-white font-semibold">{formatDate(appointment.appointment_date)}</p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Time</p>
                      <p className="text-white font-semibold">
                        {appointment.appointment_time 
                          ? new Date(`2000-01-01T${appointment.appointment_time}`).toLocaleTimeString('en-US', { 
                              hour: 'numeric', 
                              minute: '2-digit',
                              hour12: true 
                            })
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Type</p>
                      <p className="text-white font-semibold">
                        <span className={`px-3 py-1 rounded-lg text-sm ${
                          appointment.onsite_type === 'onsite' 
                            ? 'bg-green-500/20 text-green-300 border border-green-500/50' 
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/50'
                        }`}>
                          {appointment.onsite_type === 'onsite' ? 'Onsite' : 'Offsite'}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Patient Details */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Patient Information
                </h3>
                {patient ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Name</p>
                      <p className="text-white font-semibold">{patient.first_name} {patient.last_name}</p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Patient Code</p>
                      <p className="text-white font-mono">{patient.patient_code || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Age</p>
                      <p className="text-white">{calculateAge(patient.date_of_birth)} years</p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Gender</p>
                      <p className="text-white">{patient.gender || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Date of Birth</p>
                      <p className="text-white">{formatDate(patient.date_of_birth)}</p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Email</p>
                      <p className="text-white">{patient.email || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Phone</p>
                      <p className="text-white">{patient.phone || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Address</p>
                      <p className="text-white">
                        {patient.street_address || 'N/A'}
                        {patient.state && `, ${patient.state}`}
                        {patient.zip_code && ` ${patient.zip_code}`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-blue-200">Patient information not available</p>
                )}
              </div>

              {encounter && (
                <EncounterRoomingPanel
                  encounterId={encounterId}
                  encounter={encounter}
                  pharmacies={pharmacies}
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

              {/* Intake Form */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Intake Form
                </h3>
                {intake ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Chief Complaint</p>
                      <p className="text-white">{intake.chief_complaint || 'N/A'}</p>
                    </div>
                    {intake.symptoms_description && (
                      <div>
                        <p className="text-blue-200 text-sm mb-1">Symptoms Description</p>
                        <p className="text-white">{intake.symptoms_description}</p>
                      </div>
                    )}
                    {intake.location && (
                      <div>
                        <p className="text-blue-200 text-sm mb-1">Location</p>
                        <p className="text-white">{intake.location}</p>
                      </div>
                    )}
                    {intake.severity && (
                      <div>
                        <p className="text-blue-200 text-sm mb-1">Severity</p>
                        <p className="text-white">{intake.severity}/10</p>
                      </div>
                    )}
                    {intake.onset && (
                      <div>
                        <p className="text-blue-200 text-sm mb-1">Onset</p>
                        <p className="text-white">{formatDate(intake.onset)}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {intake.medical_conditions && (
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Medical Conditions</p>
                          <p className="text-white text-sm">
                            {Array.isArray(intake.medical_conditions) 
                              ? intake.medical_conditions.join(', ') 
                              : 'N/A'}
                          </p>
                        </div>
                      )}
                      {intake.allergies && (
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Allergies</p>
                          <p className="text-white text-sm">
                            {Array.isArray(intake.allergies) 
                              ? intake.allergies.join(', ') 
                              : 'N/A'}
                          </p>
                        </div>
                      )}
                      {intake.current_medications && (
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Current Medications</p>
                          <p className="text-white text-sm">
                            {Array.isArray(intake.current_medications) 
                              ? intake.current_medications.join(', ') 
                              : 'N/A'}
                          </p>
                        </div>
                      )}
                      {intake.surgeries && (
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Surgeries</p>
                          <p className="text-white text-sm">
                            {Array.isArray(intake.surgeries) 
                              ? intake.surgeries.join(', ') 
                              : 'N/A'}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-white/10">
                      <div>
                        <p className="text-blue-200 text-sm mb-1">Tobacco Use</p>
                        <p className="text-white">{intake.tobacco_use ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-blue-200 text-sm mb-1">Alcohol Use</p>
                        <p className="text-white">{intake.alcohol_use ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-blue-200 text-sm mb-1">Drug Use</p>
                        <p className="text-white">{intake.drug_use ? 'Yes' : 'No'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-blue-200">Intake form not available</p>
                )}
              </div>

              {/* Vitals */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Vitals
                </h3>
                {vitals ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Blood Pressure</p>
                      <p className="text-white font-semibold">
                        {vitals.bp_systolic && vitals.bp_diastolic 
                          ? `${vitals.bp_systolic}/${vitals.bp_diastolic} mmHg`
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Heart Rate</p>
                      <p className="text-white font-semibold">
                        {vitals.heart_rate ? `${vitals.heart_rate} bpm` : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Temperature</p>
                      <p className="text-white font-semibold">
                        {vitals.temperature 
                          ? `${vitals.temperature}°${vitals.temperature_unit || 'F'}`
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">SpO2</p>
                      <p className="text-white font-semibold">
                        {vitals.spo2 ? `${vitals.spo2}%` : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Respiratory Rate</p>
                      <p className="text-white font-semibold">
                        {vitals.respiratory_rate ? `${vitals.respiratory_rate} /min` : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Weight</p>
                      <p className="text-white font-semibold">
                        {vitals.weight 
                          ? `${vitals.weight} ${vitals.weight_unit || 'lbs'}`
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">Height</p>
                      <p className="text-white font-semibold">
                        {vitals.height 
                          ? `${vitals.height} ${vitals.height_unit || 'in'}`
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-1">BMI</p>
                      <p className="text-white font-semibold">
                        {vitals.bmi ? vitals.bmi.toFixed(1) : 'N/A'}
                      </p>
                    </div>
                    {vitals.notes && (
                      <div className="col-span-full">
                        <p className="text-blue-200 text-sm mb-1">Notes</p>
                        <p className="text-white">{vitals.notes}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-blue-200">Vitals not recorded yet</p>
                )}
              </div>

              {/* AI SOAP Notes */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  AI SOAP Notes
                </h3>
                {soapNotes ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-blue-200 text-sm mb-2 font-semibold">Subjective</p>
                      <p className="text-white bg-white/5 p-3 rounded-lg">
                        {cleanSoapSection(soapNotes.subjective_text, 'subjective') || 'Will be updated.'}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-2 font-semibold">Objective</p>
                      <p className="text-white bg-white/5 p-3 rounded-lg">
                        {cleanSoapSection(soapNotes.objective_text, 'objective') || 'Will be updated.'}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-2 font-semibold">Assessment</p>
                      <p className="text-white bg-white/5 p-3 rounded-lg">
                        {cleanSoapSection(soapNotes.assessment_text, 'assessment') || 'Will be updated.'}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-200 text-sm mb-2 font-semibold">Plan</p>
                      <p className="text-white bg-white/5 p-3 rounded-lg">
                        {cleanSoapSection(soapNotes.plan_text, 'plan') || 'Will be updated.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-blue-200">SOAP notes not available yet</p>
                )}
              </div>

              {/* Pharmacy */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  Pharmacy
                </h3>
                {pharmacy ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pharmacy.name && (
                      <div>
                        <p className="text-blue-200 text-sm mb-1">Name</p>
                        <p className="text-white font-semibold">{pharmacy.name}</p>
                      </div>
                    )}
                    {pharmacy.address && (
                      <div>
                        <p className="text-blue-200 text-sm mb-1">Address</p>
                        <p className="text-white">{pharmacy.address}</p>
                      </div>
                    )}
                    {pharmacy.phone && (
                      <div>
                        <p className="text-blue-200 text-sm mb-1">Phone</p>
                        <p className="text-white">{pharmacy.phone}</p>
                      </div>
                    )}
                    {pharmacy.email && (
                      <div>
                        <p className="text-blue-200 text-sm mb-1">Email</p>
                        <p className="text-white">{pharmacy.email}</p>
                      </div>
                    )}
                    {!pharmacy.name && !pharmacy.address && !pharmacy.phone && !pharmacy.email && (
                      <p className="text-blue-200">Pharmacy #{pharmacy.id} (no details available)</p>
                    )}
                  </div>
                ) : (
                  <p className="text-blue-200">No pharmacy assigned</p>
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
