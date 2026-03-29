'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRouter, useSearchParams } from 'next/navigation'
import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { UserRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/client'
import { getStatusInfo } from '@/lib/encounter-status'
import { getProfileId, insertStatusTimeline } from '@/lib/status-timeline'
import { config } from '@/lib/config'
import { TelemedicineConnectionModal } from '@/components/TelemedicineConnectionModal'
import { PreVisitSummary } from '@/components/PreVisitSummary'

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

interface Encounter {
  id: number
  appointment_id: number
  patient_id: number
  intake_id: number | null
  pharmacy_id: number | null
  status: string
  encounter_code: string | null
}

interface Appointment {
  id: number
  appointment_date: string | null
  appointment_time: string | null
  onsite_type: string | null
}

interface IntakeForm {
  chief_complaint: string | null
  symptoms_description: string | null
  location: string | null
  severity: number | null
  onset: string | null
  medical_conditions: unknown
  allergies: unknown
  current_medications: unknown
  surgeries: unknown
  tobacco_use: boolean | null
  alcohol_use: boolean | null
  drug_use: boolean | null
}

interface Vitals {
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
}

interface SOAPNotes {
  subjective_text: string | null
  objective_text: string | null
  assessment_text: string | null
  plan_text: string | null
}

interface DoctorSOAPNotes {
  id?: number
  subjective_text: string | null
  objective_text: string | null
  assessment_text: string | null
  plan_text: string | null
}


function cleanSoapSection(
  text: string | null,
  section: 'subjective' | 'objective' | 'assessment' | 'plan'
): string | null {
  if (!text) return null
  const label = section
  const pattern = new RegExp(
    String.raw`^\s*(\*\*)?\s*${label}\s*:?\s*(\*\*)?\s*`,
    'i'
  )
  return text.replace(pattern, '').trim()
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function calculateAge(dob: string | null) {
  if (!dob) return 'N/A'
  const birthDate = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--
  return `${age} years`
}

function VideoPage() {
  const { user, loading: authLoading, role } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const encounterId = searchParams.get('encounter')
  const supabase = useMemo(() => createClient(), [])
  const [error, setError] = useState<string | null>(null)
  const [roomToken, setRoomToken] = useState<string | null>(null)
  const [roomName, setRoomName] = useState<string | null>(null)
  const [roomUrl, setRoomUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showConnectionModal, setShowConnectionModal] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [dailyIframeSrc, setDailyIframeSrc] = useState<string | null>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [intake, setIntake] = useState<IntakeForm | null>(null)
  const [vitals, setVitals] = useState<Vitals | null>(null)
  const [soapNotes, setSoapNotes] = useState<SOAPNotes | null>(null)
  const [doctorSoap, setDoctorSoap] = useState<DoctorSOAPNotes | null>(null)
  const [doctorId, setDoctorId] = useState<number | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [detailsTab, setDetailsTab] = useState<'patient' | 'intake' | 'vitals' | 'soap'>('patient')
  const [soapForm, setSoapForm] = useState<DoctorSOAPNotes>({
    subjective_text: '',
    objective_text: '',
    assessment_text: '',
    plan_text: '',
  })
  const [savingSoap, setSavingSoap] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [endMessage, setEndMessage] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('')

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirectedFrom=/video')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!encounterId || !user || authLoading) {
      setIsLoading(false)
      return
    }

    let cancelled = false
    const timeoutMs = 15000

    const fetchRoom = async () => {
      setIsLoading(true)
      setError(null)

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timed out. Please try again.')), timeoutMs)
      })

      const work = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

        const response = await fetch('/api/daily/room', {
          method: 'POST',
          headers,
          body: JSON.stringify({ encounterId: Number(encounterId) }),
        })
        const room = await response.json()
        return { response, room }
      }

      try {
        const { response, room } = await Promise.race([
          work(),
          timeoutPromise,
        ])

        if (cancelled) return

        if (!response.ok) {
          throw new Error(room?.error || 'Failed to join video room')
        }

        if (!room?.name) {
          throw new Error('Invalid room data')
        }

        if (!room?.token) {
          throw new Error('Could not get join token. Please try again.')
        }

        setRoomName(room.name)
        setRoomToken(room.token)
        setRoomUrl(room.room_url ?? null)
        setIsLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to join video room')
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchRoom()
    return () => {
      cancelled = true
    }
  }, [encounterId, user, authLoading])

  useEffect(() => {
    if (!encounterId || !supabase) return

    const fetchDetails = async () => {
      setDetailsLoading(true)
      try {
        const { data: enc } = await supabase
          .from('encounters')
          .select('*')
          .eq('id', Number(encounterId))
          .single()

        if (!enc) {
          setDetailsLoading(false)
          return
        }

        setEncounter(enc as Encounter)

        if (enc.patient_id != null && enc.patient_id !== undefined) {
          const { data: pat } = await supabase
            .from('patients')
            .select('*')
            .eq('id', enc.patient_id)
            .maybeSingle()
          setPatient(pat as Patient)
        } else {
          setPatient(null)
        }

        if (enc.appointment_id != null && enc.appointment_id !== undefined) {
          const { data: appt } = await supabase
            .from('appointments')
            .select('id, appointment_date, appointment_time, onsite_type')
            .eq('id', enc.appointment_id)
            .maybeSingle()
          setAppointment(appt as Appointment)
        } else {
          setAppointment(null)
        }

        // Intake: try encounter.intake_id first, then by appointment_id
        let intakeResult: IntakeForm | null = null
        if (enc.intake_id) {
          const { data: int } = await supabase
            .from('intake_form')
            .select('chief_complaint, symptoms_description, location, severity, onset, medical_conditions, allergies, current_medications, surgeries, tobacco_use, alcohol_use, drug_use')
            .eq('id', enc.intake_id)
            .maybeSingle()
          intakeResult = int as IntakeForm
        }
        if (!intakeResult && enc.appointment_id) {
          const { data: int } = await supabase
            .from('intake_form')
            .select('chief_complaint, symptoms_description, location, severity, onset, medical_conditions, allergies, current_medications, surgeries, tobacco_use, alcohol_use, drug_use')
            .eq('appointment_id', enc.appointment_id)
            .maybeSingle()
          intakeResult = int as IntakeForm
        }
        if (intakeResult) setIntake(intakeResult)

        const { data: vit } = await supabase
          .from('vitals')
          .select('*')
          .eq('encounter_id', Number(encounterId))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setVitals(vit as Vitals)

        let soapData: SOAPNotes | null = null
        const { data: soapEnc, error: soapEncErr } = await supabase
          .from('ai_soapnotes')
          .select('subjective_text, objective_text, assessment_text, plan_text')
          .eq('encounter_id', Number(encounterId))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (soapEncErr?.code === '42703') {
          const { data: soapAppt } = await supabase
            .from('ai_soapnotes')
            .select('subjective_text, objective_text, assessment_text, plan_text')
            .eq('appointment_id', enc.appointment_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          soapData = soapAppt as SOAPNotes
        } else if (soapEnc) {
          soapData = soapEnc as SOAPNotes
        } else {
          const { data: soapAppt } = await supabase
            .from('ai_soapnotes')
            .select('subjective_text, objective_text, assessment_text, plan_text')
            .eq('appointment_id', enc.appointment_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          soapData = soapAppt as SOAPNotes
        }
        setSoapNotes(soapData)

        const { data: { user: authUser } } = await supabase.auth.getUser()
        const { data: docRow } = await supabase
          .from('doctors')
          .select('id')
          .eq('user_id', authUser?.id)
          .maybeSingle()
        if (docRow) setDoctorId(docRow.id)

        const { data: docSoap } = await supabase
          .from('doctor_soapnotes')
          .select('id, subjective_text, objective_text, assessment_text, plan_text')
          .eq('encounter_id', Number(encounterId))
          .maybeSingle()
        if (docSoap) {
          setDoctorSoap(docSoap as DoctorSOAPNotes)
          setSoapForm({
            subjective_text: docSoap.subjective_text ?? '',
            objective_text: docSoap.objective_text ?? '',
            assessment_text: docSoap.assessment_text ?? '',
            plan_text: docSoap.plan_text ?? '',
          })
        } else {
          setSoapForm({
            subjective_text: '',
            objective_text: '',
            assessment_text: '',
            plan_text: '',
          })
        }

        if (authUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('uid', authUser.id)
            .maybeSingle()
          const name = profile?.full_name || authUser.email?.split('@')[0] || 'User'
          setUserName(name)
        }
      } catch (e) {
        console.error('Error fetching patient details:', e)
      } finally {
        setDetailsLoading(false)
      }
    }

    fetchDetails()
  }, [encounterId, supabase])

  // For nurses/staff: watch encounter status; if doctor concludes, show message then send them back to flowboard
  useEffect(() => {
    if (!encounterId || !supabase) return
    if (role === 'doctor') return
    if (sessionEnded) return

    const encounterIdNum = Number(encounterId)
    if (Number.isNaN(encounterIdNum)) return

    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('encounters')
          .select('status')
          .eq('id', encounterIdNum)
          .maybeSingle()

        if (!error && data?.status === 'consultation_concluded') {
          setSessionEnded(true)
          setEndMessage(
            `Doctor has concluded the consultation for room #${encounterIdNum}. Returning to flowboard...`
          )
          // Give nurse ~6 seconds to read the message
          setTimeout(() => {
            router.push(`/dashboard/flowboard?encounter=${encounterIdNum}`)
          }, 6000)
        }
      } catch (e) {
        // Ignore polling errors; try again on next tick
        console.error('Error polling encounter status:', e)
      }
    }, 10000) // poll every 10 seconds

    return () => clearInterval(interval)
  }, [encounterId, supabase, role, sessionEnded, router])

  const handleConnect = () => {
    if (!roomToken) return
    const baseUrl = roomUrl || (() => {
      const rawDomain = (config.daily.domain || '').trim() || 'demo.daily.co'
      const d = rawDomain.includes('.daily.co') ? rawDomain : `${rawDomain}.daily.co`
      return `https://${d}/${roomName}`
    })()
    const sep = baseUrl.includes('?') ? '&' : '?'
    setDailyIframeSrc(`${baseUrl}${sep}t=${encodeURIComponent(roomToken)}`)
    setShowConnectionModal(false)
    setError(null)
    setIsConnected(true)
  }

  const handleEndCall = async () => {
    setDailyIframeSrc(null)
    setIsConnected(false)
    if (role === 'doctor' && encounterId && doctorId) {
      await handleEndConsultation()
    } else {
      router.push(encounterId ? `/dashboard/flowboard?encounter=${encounterId}` : '/dashboard')
    }
  }

  const validateDoctorSoap = (): boolean => {
    const fields: Array<keyof typeof soapForm> = [
      'subjective_text',
      'objective_text',
      'assessment_text',
      'plan_text',
    ]
    for (const field of fields) {
      const value = soapForm[field]
      if (typeof value !== 'string' || !value.trim()) {
        alert('All SOAP sections (Subjective, Objective, Assessment, Plan) must be filled in before continuing.')
        return false
      }
    }
    return true
  }

  const handleSaveDoctorSoap = async () => {
    if (!encounterId || !doctorId || role !== 'doctor') return
    if (!validateDoctorSoap()) return

    setSavingSoap(true)
    try {
      const payload = {
        encounter_id: Number(encounterId),
        doctor_id: doctorId,
        subjective_text: soapForm.subjective_text!.trim(),
        objective_text: soapForm.objective_text!.trim(),
        assessment_text: soapForm.assessment_text!.trim(),
        plan_text: soapForm.plan_text!.trim(),
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('doctor_soapnotes')
        .upsert(payload, {
          onConflict: 'encounter_id',
          ignoreDuplicates: false,
        })
      if (error) throw error
      setDoctorSoap({ ...soapForm })
    } catch (e) {
      console.error('Error saving doctor SOAP:', e)
      alert('Failed to save SOAP note. Please try again.')
    } finally {
      setSavingSoap(false)
    }
  }

  const handleEndConsultation = async () => {
    if (!encounterId || !doctorId || role !== 'doctor') return
    if (!validateDoctorSoap()) return

    setSavingSoap(true)
    try {
      const encounterIdNum = Number(encounterId)
      const payload = {
        encounter_id: encounterIdNum,
        doctor_id: doctorId,
        subjective_text: soapForm.subjective_text!.trim(),
        objective_text: soapForm.objective_text!.trim(),
        assessment_text: soapForm.assessment_text!.trim(),
        plan_text: soapForm.plan_text!.trim(),
        updated_at: new Date().toISOString(),
      }

      // Save/overwrite doctor SOAP note (ensures nothing is null)
      const { error: soapError } = await supabase
        .from('doctor_soapnotes')
        .upsert(payload, {
          onConflict: 'encounter_id',
          ignoreDuplicates: false,
        })
      if (soapError) throw soapError

      setDoctorSoap({ ...soapForm })

      // Move encounter to consultation_concluded
      const { error: encounterError } = await supabase
        .from('encounters')
        .update({
          status: 'consultation_concluded',
          updated_at: new Date().toISOString(),
        })
        .eq('id', encounterIdNum)

      if (encounterError) throw encounterError

      if (user?.id) {
        const profileId = await getProfileId(supabase, user.id)
        await insertStatusTimeline(supabase, {
          encounterId: encounterIdNum,
          status: 'consultation_concluded',
          profileId,
        })
      }

      // Best-effort: tell backend to delete the Daily.co room for this encounter
      try {
        await fetch('/api/daily/end-room', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ encounterId: encounterIdNum }),
        })
      } catch (endRoomError) {
        // Ignore errors here; room cleanup is not user-facing
        console.error('Failed to end Daily.co room:', endRoomError)
      }

      // Navigate back to flowboard / EMR
      router.push(encounterId ? `/dashboard/flowboard?encounter=${encounterId}` : '/dashboard')
    } catch (e) {
      console.error('Error ending consultation:', e)
      alert('Failed to end consultation. Please try again.')
    } finally {
      setSavingSoap(false)
    }
  }

  const aiPlaceholder = (section: 'subjective' | 'objective' | 'assessment' | 'plan') => {
    if (!soapNotes) return 'AI note will appear here when available'
    const text = cleanSoapSection(
      soapNotes[`${section}_text` as keyof SOAPNotes] as string | null,
      section
    )
    return text || 'Will be updated.'
  }


  if (!encounterId && !authLoading && user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-24">
        <div className="text-red-500 mb-4 text-center max-w-md">
          Encounter ID is required. Please join from the flowboard.
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-24">
        <LoadingSpinner message="Loading..." showPercentage={false} />
      </div>
    )
  }

  if (!user) return null

  if (error && !showConnectionModal) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-24">
        <div className="text-red-500 mb-4 text-center max-w-md">Error: {error}</div>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const roleLabel = role === 'doctor' ? 'Doctor' : role === 'nurse' ? 'Nurse' : 'Staff'

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-black">
      {/* Connection Modal */}
      <TelemedicineConnectionModal
        isOpen={showConnectionModal && !isLoading && !!roomToken}
        userName={userName || 'User'}
        userRole={roleLabel}
        onConnect={handleConnect}
        onCancel={() => router.push(encounterId ? `/dashboard/flowboard?encounter=${encounterId}` : '/dashboard')}
      />

      {/* Global session-ended overlay for nurses/staff */}
      {endMessage && role !== 'doctor' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-amber-500 text-white px-6 py-4 rounded-xl shadow-2xl max-w-md text-center text-sm">
            {endMessage}
          </div>
        </div>
      )}

      {/* Top fixed header */}
      <header className="sticky top-0 z-50 flex-shrink-0 h-14 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 flex items-center px-4 gap-4">
        <button
          onClick={() => router.push(encounterId ? `/dashboard/flowboard?encounter=${encounterId}` : '/dashboard')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to EMR
        </button>
        <span className="text-gray-400 text-sm">
          {patient ? `${patient.first_name} ${patient.last_name}` : 'Telemedicine Session'}
        </span>
        {isConnected && (
          <button
            onClick={handleEndCall}
            className="ml-auto px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M16 8l2 2m0 0l2 2m-2-2l-2 2m2-2l-2-2" />
            </svg>
            End Call
          </button>
        )}
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Video: plain iframe with Daily room URL + token */}
        <div className="flex-1 bg-black flex items-center justify-center relative min-h-0">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full">
              <LoadingSpinner message="Loading video call..." showPercentage={false} />
            </div>
          )}
          {!isLoading && !isConnected && !showConnectionModal && (
            <div className="flex flex-col items-center justify-center h-full text-white">
              <p className="text-lg mb-4">Preparing video call...</p>
            </div>
          )}
          {dailyIframeSrc && (
            <iframe
              src={dailyIframeSrc}
              className="absolute inset-x-0 top-2 bottom-0 w-full h-full border-0"
              allow="camera; microphone; fullscreen; display-capture"
              title="Daily video call"
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="w-full max-w-md bg-gray-900 border-l border-gray-800 text-white flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
            <h2 className="text-lg font-semibold">Patient Details</h2>
            {encounter && (
              <span className="text-xs text-gray-400 block mt-0.5">
                {getStatusInfo(encounter.status as any)?.label || encounter.status}
              </span>
            )}
          </div>
          {!detailsLoading && (
            <div className="flex border-b border-gray-800 flex-shrink-0 overflow-x-auto">
              {(['patient', 'intake', 'vitals', 'soap'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDetailsTab(tab)}
                  className={`flex-shrink-0 px-2 py-2 text-xs font-medium capitalize transition-colors ${
                    detailsTab === tab ? 'text-white border-b-2 border-blue-500 bg-white/5' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tab === 'soap' ? 'SOAP' : tab}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-auto p-4 text-sm">
            {detailsLoading ? (
              <LoadingSpinner message="Loading details..." showPercentage={false} size="sm" />
            ) : (
              <>
                {detailsTab === 'patient' && (
                  <div className="space-y-4">
                    {intake && patient && (
                      <PreVisitSummary
                        intake={intake}
                        patientName={`${patient.first_name} ${patient.last_name}`}
                      />
                    )}
                    {patient && (
                      <div className="space-y-1 text-gray-300">
                        <p className="font-medium text-white">{patient.first_name} {patient.last_name}</p>
                        <p>Code: {patient.patient_code || 'N/A'}</p>
                        <p>Age: {calculateAge(patient.date_of_birth)}</p>
                        <p>DOB: {formatDate(patient.date_of_birth)}</p>
                        <p>Gender: {patient.gender || 'N/A'}</p>
                        <p>Email: {patient.email || 'N/A'}</p>
                        <p>Phone: {patient.phone || 'N/A'}</p>
                        {(patient.street_address || patient.state || patient.zip_code) && (
                          <p>Address: {[patient.street_address, patient.state, patient.zip_code].filter(Boolean).join(', ')}</p>
                        )}
                      </div>
                    )}
                    {appointment && (
                      <div className="pt-3 border-t border-gray-700">
                        <p className="text-blue-300 font-semibold mb-2">Appointment</p>
                        <p>Date: {formatDate(appointment.appointment_date)}</p>
                        <p>Time: {appointment.appointment_time || 'N/A'}</p>
                        <p>Type: {appointment.onsite_type || 'N/A'}</p>
                      </div>
                    )}
                  </div>
                )}
                {detailsTab === 'intake' && (
                  <div className="space-y-1 text-gray-300">
                    {intake ? (
                      <>
                        <p>Chief Complaint: {intake.chief_complaint || 'N/A'}</p>
                        {intake.symptoms_description && <p>Symptoms: {intake.symptoms_description}</p>}
                        {intake.location && <p>Location: {intake.location}</p>}
                        {intake.severity != null && <p>Severity: {intake.severity}/10</p>}
                        {intake.onset && <p>Onset: {formatDate(intake.onset)}</p>}
                        {intake.medical_conditions && (
                          <p>Conditions: {Array.isArray(intake.medical_conditions) ? intake.medical_conditions.join(', ') : 'N/A'}</p>
                        )}
                        {intake.allergies && (
                          <p>Allergies: {Array.isArray(intake.allergies) ? intake.allergies.join(', ') : 'N/A'}</p>
                        )}
                        {intake.current_medications && (
                          <p>Meds: {Array.isArray(intake.current_medications) ? intake.current_medications.join(', ') : 'N/A'}</p>
                        )}
                        <p>Tobacco: {intake.tobacco_use ? 'Yes' : 'No'} | Alcohol: {intake.alcohol_use ? 'Yes' : 'No'} | Drugs: {intake.drug_use ? 'Yes' : 'No'}</p>
                      </>
                    ) : (
                      <p className="text-gray-400">Intake not available</p>
                    )}
                  </div>
                )}
                {detailsTab === 'vitals' && (
                  <div className="grid grid-cols-2 gap-2 text-gray-300">
                    {vitals ? (
                      <>
                        <p>BP: {vitals.bp_systolic && vitals.bp_diastolic ? `${vitals.bp_systolic}/${vitals.bp_diastolic}` : 'N/A'}</p>
                        <p>HR: {vitals.heart_rate ? `${vitals.heart_rate} bpm` : 'N/A'}</p>
                        <p>Temp: {vitals.temperature ? `${vitals.temperature}°${vitals.temperature_unit || 'F'}` : 'N/A'}</p>
                        <p>SpO2: {vitals.spo2 ? `${vitals.spo2}%` : 'N/A'}</p>
                        <p>RR: {vitals.respiratory_rate ? `${vitals.respiratory_rate}/min` : 'N/A'}</p>
                        <p>Weight: {vitals.weight ? `${vitals.weight} ${vitals.weight_unit || 'lbs'}` : 'N/A'}</p>
                        <p>Height: {vitals.height ? `${vitals.height} ${vitals.height_unit || 'in'}` : 'N/A'}</p>
                        <p>BMI: {vitals.bmi ? vitals.bmi.toFixed(1) : 'N/A'}</p>
                        {vitals.notes && <p className="col-span-2">Notes: {vitals.notes}</p>}
                      </>
                    ) : (
                      <p className="text-gray-400 col-span-2">Not recorded</p>
                    )}
                  </div>
                )}
                {detailsTab === 'soap' && (
                  <div className="space-y-3">
                    {role === 'doctor' && doctorId ? (
                      <>
                        <p className="text-cyan-200 text-xs mb-2">Add your SOAP note. Placeholders show AI suggestions.</p>
                        <div>
                          <label className="text-cyan-200 text-xs font-medium block mb-1">Subjective</label>
                          <textarea
                            value={soapForm.subjective_text ?? ''}
                            onChange={(e) => setSoapForm((f) => ({ ...f, subjective_text: e.target.value }))}
                            placeholder={aiPlaceholder('subjective')}
                            rows={3}
                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-cyan-200 text-xs font-medium block mb-1">Objective</label>
                          <textarea
                            value={soapForm.objective_text ?? ''}
                            onChange={(e) => setSoapForm((f) => ({ ...f, objective_text: e.target.value }))}
                            placeholder={aiPlaceholder('objective')}
                            rows={3}
                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-cyan-200 text-xs font-medium block mb-1">Assessment</label>
                          <textarea
                            value={soapForm.assessment_text ?? ''}
                            onChange={(e) => setSoapForm((f) => ({ ...f, assessment_text: e.target.value }))}
                            placeholder={aiPlaceholder('assessment')}
                            rows={3}
                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-cyan-200 text-xs font-medium block mb-1">Plan</label>
                          <textarea
                            value={soapForm.plan_text ?? ''}
                            onChange={(e) => setSoapForm((f) => ({ ...f, plan_text: e.target.value }))}
                            placeholder={aiPlaceholder('plan')}
                            rows={3}
                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleSaveDoctorSoap}
                            disabled={savingSoap}
                            className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            {savingSoap ? 'Saving...' : 'Save SOAP Note'}
                          </button>
                          <button
                            type="button"
                            onClick={handleEndConsultation}
                            disabled={savingSoap}
                            className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            {savingSoap ? 'Ending...' : 'End Consultation'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3 text-gray-300">
                        {(doctorSoap || soapNotes) ? (
                          <>
                            <div>
                              <p className="text-cyan-200 text-xs font-medium mb-1">Subjective</p>
                              <p className="bg-white/5 p-2 rounded text-xs">
                                {(doctorSoap?.subjective_text && doctorSoap.subjective_text.trim()) || (soapNotes && (cleanSoapSection(soapNotes.subjective_text, 'subjective') || 'Will be updated.')) || 'Not available yet'}
                              </p>
                            </div>
                            <div>
                              <p className="text-cyan-200 text-xs font-medium mb-1">Objective</p>
                              <p className="bg-white/5 p-2 rounded text-xs">
                                {(doctorSoap?.objective_text && doctorSoap.objective_text.trim()) || (soapNotes && (cleanSoapSection(soapNotes.objective_text, 'objective') || 'Will be updated.')) || 'Not available yet'}
                              </p>
                            </div>
                            <div>
                              <p className="text-cyan-200 text-xs font-medium mb-1">Assessment</p>
                              <p className="bg-white/5 p-2 rounded text-xs">
                                {(doctorSoap?.assessment_text && doctorSoap.assessment_text.trim()) || (soapNotes && (cleanSoapSection(soapNotes.assessment_text, 'assessment') || 'Will be updated.')) || 'Not available yet'}
                              </p>
                            </div>
                            <div>
                              <p className="text-cyan-200 text-xs font-medium mb-1">Plan</p>
                              <p className="bg-white/5 p-2 rounded text-xs">
                                {(doctorSoap?.plan_text && doctorSoap.plan_text.trim()) || (soapNotes && (cleanSoapSection(soapNotes.plan_text, 'plan') || 'Will be updated.')) || 'Not available yet'}
                              </p>
                            </div>
                          </>
                        ) : (
                          <p className="text-gray-400">SOAP notes not available yet</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="px-4 py-2 border-t border-gray-800 flex-shrink-0">
            <button
              onClick={() => router.push(encounterId ? `/dashboard/flowboard?encounter=${encounterId}` : '/dashboard')}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              ← Back to EMR
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default withRoleProtection(VideoPage, {
  allowedRoles: [UserRole.DOCTOR, UserRole.NURSE, UserRole.STAFF],
  redirectTo: '/dashboard',
})
