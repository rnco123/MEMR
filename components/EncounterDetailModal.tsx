'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner } from './LoadingSpinner'

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
  status: string
  encounter_code: string | null
  created_at: string
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
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [intake, setIntake] = useState<IntakeForm | null>(null)
  const [vitals, setVitals] = useState<Vitals | null>(null)
  const [soapNotes, setSoapNotes] = useState<SOAPNotes | null>(null)
  const [encounter, setEncounter] = useState<Encounter | null>(null)

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

        setEncounter(encounterData as Encounter)

        // Fetch intake form if intake_id exists
        if (encounterData?.intake_id) {
          const { data: intakeData, error: intakeError } = await supabase
            .from('intake_form')
            .select('*')
            .eq('id', encounterData.intake_id)
            .maybeSingle()

          if (intakeError) {
            console.error('Error fetching intake form:', intakeError)
          } else if (intakeData) {
            setIntake(intakeData as IntakeForm)
          }
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
      } catch (error) {
        console.error('Error fetching encounter details:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isOpen, encounterId, appointmentId, patientId, supabase])

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
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-white">Encounter Details</h2>
            {encounter?.encounter_code && (
              <span className="text-sm text-blue-300 font-mono">#{encounter.encounter_code}</span>
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
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner message="Loading encounter details..." />
            </div>
          ) : (
            <div className="space-y-6">
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
